<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Event;
use App\Services\Notifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class EventController extends Controller
{
    /** Events visible to a user: company-wide (branch null) + their branches. */
    private function visibleQuery(Request $request)
    {
        $user = $request->user();
        $branchIds = $user->accessibleBranchIds();

        return Event::with('branch:id,name', 'creator:id,name')
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
        ];
    }
}
