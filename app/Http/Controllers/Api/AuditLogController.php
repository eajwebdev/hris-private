<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Services\Auditor;
use App\Support\Permissions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Read-only view of the audit trail. There is no write endpoint by design. */
class AuditLogController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();

        $q = AuditLog::with('user:id,name', 'branch:id,name')
            ->where('company_id', $user->company_id)
            ->when($request->filled('module'), fn ($w) => $w->where('module', $request->string('module')))
            ->when($request->filled('action'), fn ($w) => $w->where('action', $request->string('action')))
            ->when($request->filled('user_id'), fn ($w) => $w->where('user_id', $request->integer('user_id')))
            ->when($request->filled('from'), fn ($w) => $w->whereDate('created_at', '>=', $request->date('from')))
            ->when($request->filled('to'), fn ($w) => $w->whereDate('created_at', '<=', $request->date('to')))
            ->when($request->filled('search'), function ($w) use ($request) {
                $s = $request->string('search')->trim()->value();
                $w->where(fn ($x) => $x->where('description', 'like', "%{$s}%")
                    ->orWhere('subject_label', 'like', "%{$s}%")
                    ->orWhere('user_name', 'like', "%{$s}%"));
            });

        // A branch-scoped admin only sees their branches' entries (plus company-wide ones).
        if (! $user->isSuperAdmin()) {
            $ids = $user->accessibleBranchIds() ?: [0];
            $q->where(fn ($w) => $w->whereNull('branch_id')->orWhereIn('branch_id', $ids));
        }

        $page = $q->orderByDesc('created_at')->paginate($request->integer('per_page', 25));

        $page->getCollection()->transform(fn (AuditLog $l) => [
            'id' => $l->id,
            'module' => $l->module,
            'module_label' => Permissions::modules()[$l->module]['label'] ?? ucfirst($l->module),
            'action' => $l->action,
            'description' => $l->description,
            'subject_label' => $l->subject_label,
            'subject_type' => $l->subject_type ? class_basename($l->subject_type) : null,
            'changes' => $l->changes,
            'user' => $l->user?->name ?? $l->user_name,
            'branch' => $l->branch?->name,
            'ip' => $l->ip,
            'created_at' => $l->created_at->toIso8601String(),
        ]);

        return $page;
    }

    /** Filter options for the log's toolbar. */
    public function meta(): JsonResponse
    {
        return response()->json([
            'modules' => collect(Permissions::modules())
                ->map(fn ($m, $key) => ['value' => $key, 'label' => $m['label']])->values(),
            'actions' => collect(Auditor::ACTIONS)
                ->map(fn ($a) => ['value' => $a, 'label' => ucfirst($a)])->values(),
        ]);
    }
}
