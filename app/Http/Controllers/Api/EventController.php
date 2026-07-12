<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Event;
use App\Models\EventRsvp;
use App\Services\Notifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class EventController extends Controller
{
    public const RSVP_STATUSES = ['going', 'maybe', 'declined'];

    /**
     * Events visible to a user: company-wide (branch null) + their branches.
     *
     * Eager-loads the caller's own RSVP (not everyone's) plus per-status counts,
     * so a calendar of N events costs a constant number of queries.
     */
    private function visibleQuery(Request $request)
    {
        $user = $request->user();
        $branchIds = $user->accessibleBranchIds();

        return Event::with([
            'branch:id,name',
            'creator:id,name',
            'rsvps' => fn ($q) => $q->where('user_id', $user->id),
        ])
            ->withCount([
                'rsvps as going_count' => fn ($q) => $q->where('status', 'going'),
                'rsvps as maybe_count' => fn ($q) => $q->where('status', 'maybe'),
                'rsvps as declined_count' => fn ($q) => $q->where('status', 'declined'),
            ])
            ->where('company_id', $user->company_id)
            ->where(function ($q) use ($branchIds) {
                $q->whereNull('branch_id')->orWhereIn('branch_id', $branchIds);
            });
    }

    /** Admin calendar/list — optional month range via from/to. */
    public function index(Request $request)
    {
        $q = $this->visibleQuery($request)
            ->when($request->filled('from'), fn ($w) => $w->where('starts_at', '>=', $request->date('from')))
            ->when($request->filled('to'), fn ($w) => $w->where('starts_at', '<=', $request->date('to')->endOfDay()))
            ->orderBy('starts_at');

        return response()->json(['data' => $q->get()->map(fn ($e) => $this->shape($e))]);
    }

    /** Employee read-only feed: upcoming events. */
    public function feed(Request $request)
    {
        $events = $this->visibleQuery($request)
            ->where(fn ($q) => $q->where('ends_at', '>=', now())->orWhere('starts_at', '>=', now()->startOfDay()))
            ->orderBy('starts_at')
            ->limit($request->integer('limit', 20))
            ->get()
            ->map(fn ($e) => $this->shape($e));

        return response()->json(['data' => $events]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validateEvent($request);
        $user = $request->user();

        $event = Event::create(array_merge($data, [
            'company_id' => $user->company_id,
            'created_by' => $user->id,
        ]));

        // Notify the audience (employees see it in their dashboard, view-only).
        Notifier::toCompany($user->company_id, [
            'type' => 'event',
            'title' => 'New event: ' . $event->title,
            'body' => $event->starts_at->format('M j, Y g:i A') . ($event->location ? ' · ' . $event->location : ''),
            'link' => '/ess/events',
            'icon' => 'calendar',
        ], $event->branch_id, $user->id);

        return response()->json(['message' => 'Event created.', 'event' => $this->shape($event->fresh(['branch', 'creator']))], 201);
    }

    public function update(Request $request, Event $event): JsonResponse
    {
        $data = $this->validateEvent($request);
        $event->update($data);

        return response()->json(['message' => 'Event updated.', 'event' => $this->shape($event->fresh(['branch', 'creator']))]);
    }

    public function destroy(Event $event): JsonResponse
    {
        $event->delete();

        return response()->json(['message' => 'Event deleted.']);
    }

    /**
     * Employee RSVPs to an event (or changes their answer). One row per
     * (event, user) — the unique index makes this an upsert, not an append.
     */
    public function rsvp(Request $request, Event $event): JsonResponse
    {
        $user = $request->user();

        // Must be an event this user can actually see.
        abort_unless(
            $event->company_id === $user->company_id
            && ($event->branch_id === null || in_array($event->branch_id, $user->accessibleBranchIds(), true)),
            404
        );

        if (! $event->rsvp_enabled) {
            return response()->json(['message' => 'RSVP isn’t open for this event.'], 422);
        }

        $data = $request->validate([
            'status' => ['required', 'in:' . implode(',', self::RSVP_STATUSES)],
        ]);

        EventRsvp::updateOrCreate(
            ['event_id' => $event->id, 'user_id' => $user->id],
            ['status' => $data['status']],
        );

        $label = ['going' => 'You’re going.', 'maybe' => 'Marked as maybe.', 'declined' => 'You’ve declined.'];

        return response()->json([
            'message' => $label[$data['status']],
            'event' => $this->shape($this->visibleQuery($request)->findOrFail($event->id)),
        ]);
    }

    /** HR: who's coming. Gated by the events module. */
    public function attendees(Request $request, Event $event): JsonResponse
    {
        abort_unless($event->company_id === $request->user()->company_id, 404);

        $rsvps = $event->rsvps()->with('user:id,name,email')->get();

        $shape = fn ($status) => $rsvps->where('status', $status)->map(fn ($r) => [
            'id' => $r->id,
            'user_id' => $r->user_id,
            'name' => $r->user?->name ?? '—',
            'email' => $r->user?->email,
            'responded_at' => $r->updated_at?->toIso8601String(),
        ])->values();

        return response()->json([
            'event' => ['id' => $event->id, 'title' => $event->title, 'rsvp_enabled' => $event->rsvp_enabled],
            'going' => $shape('going'),
            'maybe' => $shape('maybe'),
            'declined' => $shape('declined'),
        ]);
    }

    private function validateEvent(Request $request): array
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:150'],
            'description' => ['nullable', 'string'],
            'location' => ['nullable', 'string', 'max:150'],
            'branch_id' => ['nullable', 'exists:branches,id'],
            'starts_at' => ['required', 'date'],
            'ends_at' => ['nullable', 'date', 'after_or_equal:starts_at'],
            'all_day' => ['boolean'],
            'rsvp_enabled' => ['boolean'],
            'color' => ['nullable', 'string', 'max:20'],
        ]);
        $data['audience'] = $data['branch_id'] ?? null ? 'branch' : 'all';

        return $data;
    }

    private function shape(Event $e): array
    {
        return [
            'id' => $e->id,
            'title' => $e->title,
            'description' => $e->description,
            'location' => $e->location,
            'branch_id' => $e->branch_id,
            'branch' => $e->branch?->name,
            'starts_at' => $e->starts_at->toIso8601String(),
            'ends_at' => $e->ends_at?->toIso8601String(),
            'all_day' => $e->all_day,
            'rsvp_enabled' => $e->rsvp_enabled,
            'color' => $e->color,
            'audience' => $e->audience,
            'created_by' => $e->creator?->name,
            // `rsvps` is constrained to the caller in visibleQuery(), so this is
            // *their* answer — null until they respond.
            'my_rsvp' => $e->relationLoaded('rsvps') ? $e->rsvps->first()?->status : null,
            'rsvp_counts' => [
                'going' => (int) ($e->going_count ?? 0),
                'maybe' => (int) ($e->maybe_count ?? 0),
                'declined' => (int) ($e->declined_count ?? 0),
            ],
        ];
    }
}
