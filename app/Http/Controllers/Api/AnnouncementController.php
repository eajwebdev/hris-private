<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Announcement;
use App\Services\Notifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AnnouncementController extends Controller
{
    /** Announcements visible to a user: company-wide + their branches. */
    private function visibleQuery(Request $request)
    {
        $user = $request->user();
        $branchIds = $user->accessibleBranchIds();

        return Announcement::with('branch:id,name', 'creator:id,name')
            ->where('company_id', $user->company_id)
            ->where(function ($q) use ($branchIds) {
                $q->whereNull('branch_id')->orWhereIn('branch_id', $branchIds);
            });
    }

    /** Employee feed — published only, pinned first. */
    public function feed(Request $request): JsonResponse
    {
        $items = $this->visibleQuery($request)
            ->whereNotNull('published_at')->where('published_at', '<=', now())
            ->orderByDesc('is_pinned')->orderByDesc('published_at')
            ->limit($request->integer('limit', 20))
            ->get()->map(fn ($a) => $this->shape($a));

        return response()->json(['data' => $items]);
    }

    /** Admin list — everything, drafts included. */
    public function index(Request $request): JsonResponse
    {
        $items = $this->visibleQuery($request)
            ->orderByDesc('is_pinned')->orderByDesc('created_at')
            ->get()->map(fn ($a) => $this->shape($a));

        return response()->json(['data' => $items]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validateAnnouncement($request);
        $user = $request->user();

        $announcement = Announcement::create(array_merge($data, [
            'company_id' => $user->company_id,
            'created_by' => $user->id,
            'published_at' => ($data['publish'] ?? true) ? now() : null,
        ]));

        if ($announcement->published_at) {
            $this->notifyAudience($announcement, $user->id);
        }

        return response()->json(['message' => 'Announcement posted.', 'announcement' => $this->shape($announcement->fresh(['branch', 'creator']))], 201);
    }

    public function update(Request $request, Announcement $announcement): JsonResponse
    {
        $data = $this->validateAnnouncement($request);
        $wasDraft = $announcement->published_at === null;

        if (($data['publish'] ?? true) && $wasDraft) {
            $data['published_at'] = now();
        }
        unset($data['publish']);
        $announcement->update($data);

        // Publishing a draft notifies the audience once.
        if ($wasDraft && $announcement->published_at) {
            $this->notifyAudience($announcement, $request->user()->id);
        }

        return response()->json(['message' => 'Announcement updated.', 'announcement' => $this->shape($announcement->fresh(['branch', 'creator']))]);
    }

    public function destroy(Announcement $announcement): JsonResponse
    {
        $announcement->delete();

        return response()->json(['message' => 'Announcement deleted.']);
    }

    private function notifyAudience(Announcement $a, int $exceptUserId): void
    {
        Notifier::toCompany($a->company_id, [
            'type' => 'announcement',
            'title' => '📢 ' . $a->title,
            'body' => str($a->body)->stripTags()->limit(120)->toString(),
            'link' => '/ess',
            'icon' => 'megaphone',
        ], $a->branch_id, $exceptUserId);
    }

    private function validateAnnouncement(Request $request): array
    {
        return $request->validate([
            'title' => ['required', 'string', 'max:150'],
            'body' => ['required', 'string', 'max:10000'],
            'branch_id' => ['nullable', 'exists:branches,id'],
            'is_pinned' => ['boolean'],
            'priority' => ['nullable', 'in:normal,important,urgent'],
            'publish' => ['boolean'],
        ]);
    }

    private function shape(Announcement $a): array
    {
        return [
            'id' => $a->id,
            'title' => $a->title,
            'body' => $a->body,
            'branch_id' => $a->branch_id,
            'branch' => $a->branch?->name,
            'is_pinned' => $a->is_pinned,
            'priority' => $a->priority ?? 'normal',
            'published_at' => $a->published_at?->toIso8601String(),
            'created_by' => $a->creator?->name,
            'created_at' => $a->created_at->toIso8601String(),
        ];
    }
}
