<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\LeaveApproval;
use App\Models\LeaveBalance;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Models\User;
use App\Services\Auditor;
use App\Services\Notifier;
use App\Support\PrivateFile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class LeaveController extends Controller
{
    /**
     * How many people in one department may be off on the same day before HR is
     * warned. Advisory only — it never blocks a request.
     */
    private const COVERAGE_THRESHOLD = 2;

    /** Resolve the employee record for the authenticated user (ESS). */
    private function currentEmployee(Request $request): Employee
    {
        $employee = Employee::withoutGlobalScopes()->where('user_id', $request->user()->id)->first();
        abort_unless($employee, 422, 'Your login isn’t linked to an employee record. Ask HR to connect it.');

        return $employee;
    }

    // ---------------------------------------------------------------- ESS

    /** My balances (current year) + my requests. */
    public function my(Request $request): JsonResponse
    {
        $employee = $this->currentEmployee($request);
        $types = LeaveType::where('company_id', $request->user()->company_id)->where('is_active', true)->orderBy('name')->get();

        $balances = $types->map(function ($type) use ($employee) {
            $b = LeaveBalance::current($employee->id, $type);

            return [
                'type_id' => $type->id,
                'type' => $type->name,
                'code' => $type->code,
                'color' => $type->color,
                'is_paid' => $type->is_paid,
                'allocated' => (float) $b->allocated,
                'used' => (float) $b->used,
                'remaining' => $b->remaining,
            ];
        });

        $requests = LeaveRequest::withoutGlobalScopes()->with('type:id,name,color', 'approvals.approver:id,name', 'approvals.actor:id,name')
            ->where('employee_id', $employee->id)
            ->orderByDesc('created_at')->limit(50)->get()
            ->map(fn ($r) => $this->shape($r));

        return response()->json(['balances' => $balances, 'requests' => $requests]);
    }

    /** File a leave request (ESS). Accepts multipart when an attachment is sent. */
    public function store(Request $request): JsonResponse
    {
        $employee = $this->currentEmployee($request);

        $data = $request->validate([
            'leave_type_id' => ['required', 'exists:leave_types,id'],
            'date_from' => ['required', 'date', 'after_or_equal:today'],
            'date_to' => ['required', 'date', 'after_or_equal:date_from'],
            'half_day' => ['nullable', 'in:am,pm'],
            'reason' => ['nullable', 'string', 'max:1000'],
            'attachment' => ['nullable', 'file', 'mimes:pdf,jpg,jpeg,png,doc,docx', 'max:5120'],
        ]);

        $from = Carbon::parse($data['date_from']);
        $to = Carbon::parse($data['date_to']);
        $halfDay = $data['half_day'] ?? null;

        // A half-day only makes sense on one date.
        if ($halfDay && ! $from->isSameDay($to)) {
            return response()->json(['message' => 'A half-day request must start and end on the same date.'], 422);
        }

        $type = LeaveType::findOrFail($data['leave_type_id']);
        $days = LeaveRequest::chargeableDays($from, $to, $halfDay);
        if ($days <= 0) {
            return response()->json(['message' => 'The selected range has no working days.'], 422);
        }

        $balance = LeaveBalance::current($employee->id, $type);
        if ($days > $balance->remaining) {
            return response()->json(['message' => "Not enough {$type->name} balance — {$balance->remaining} day(s) left, {$days} requested."], 422);
        }

        $overlap = LeaveRequest::withoutGlobalScopes()
            ->where('employee_id', $employee->id)
            ->whereIn('status', ['pending', 'approved'])
            ->where('date_from', '<=', $data['date_to'])
            ->where('date_to', '>=', $data['date_from'])
            ->exists();
        if ($overlap) {
            return response()->json(['message' => 'You already have a leave request covering those dates.'], 422);
        }

        $leave = DB::transaction(function () use ($request, $employee, $type, $data, $days, $halfDay) {
            $attachmentPath = null;
            $attachmentName = null;

            if ($request->hasFile('attachment')) {
                $file = $request->file('attachment');
                // Medical certificates and the like — private disk, never public/storage.
                $attachmentPath = $file->store("leave/{$employee->branch_id}/{$employee->id}", PrivateFile::DISK);
                $attachmentName = $file->getClientOriginalName();
            }

            $leave = LeaveRequest::create([
                'employee_id' => $employee->id,
                'branch_id' => $employee->branch_id,
                'leave_type_id' => $type->id,
                'date_from' => $data['date_from'],
                'date_to' => $data['date_to'],
                'half_day' => $halfDay,
                'days' => $days,
                'reason' => $data['reason'] ?? null,
                'attachment_path' => $attachmentPath,
                'attachment_name' => $attachmentName,
            ]);

            $this->buildApprovalChain($leave, $employee);

            return $leave;
        });

        $this->notifyCurrentApprover($leave->fresh('approvals'), $employee);

        $coverage = $this->coverageWarning($employee, $from, $to, $leave->id);

        return response()->json([
            'message' => "Leave request filed — {$days} working day(s) of {$type->name}.",
            'request' => $this->shape($leave->fresh(['type', 'approvals.approver', 'approvals.actor'])),
            'coverage_warning' => $coverage,
        ], 201);
    }

    /** Cancel my own pending request (ESS). */
    public function cancel(Request $request, int $id): JsonResponse
    {
        $employee = $this->currentEmployee($request);
        $leave = LeaveRequest::withoutGlobalScopes()
            ->where('employee_id', $employee->id)->where('status', 'pending')->findOrFail($id);

        $leave->update(['status' => 'cancelled', 'current_level' => null, 'acted_at' => now()]);
        $leave->approvals()->where('status', 'pending')->update(['status' => 'skipped']);

        return response()->json(['message' => 'Leave request cancelled.']);
    }

    // -------------------------------------------------------------- Admin

    /** HR list with filters (branch-scoped via global scope). */
    public function index(Request $request)
    {
        $q = LeaveRequest::with(
            'employee:id,first_name,last_name,photo_path,department_id',
            'employee.position:id,title',
            'type:id,name,color',
            'actor:id,name',
            'approvals.approver:id,name',
            'approvals.actor:id,name',
        )
            ->when($request->filled('status'), fn ($w) => $w->where('status', $request->string('status')))
            ->when($request->filled('branch_id'), fn ($w) => $w->where('branch_id', $request->integer('branch_id')))
            // "Waiting on me" — only the step the request is *currently* on, so a
            // supervisor doesn't see requests already escalated past them.
            ->when($request->boolean('mine'), fn ($w) => $w
                ->where('status', 'pending')
                ->whereHas('approvals', fn ($a) => $a
                    ->where('status', 'pending')
                    ->where('approver_id', $request->user()->id)
                    ->whereColumn('leave_approvals.level', 'leave_requests.current_level')))
            ->orderByRaw("case when status = 'pending' then 0 else 1 end")
            ->orderByDesc('created_at');

        $page = $q->paginate($request->integer('per_page', 20));
        $page->getCollection()->transform(fn ($r) => $this->shape($r, admin: true));

        return $page;
    }

    /**
     * Team/branch leave calendar for a date range: every request that overlaps
     * the window, plus a per-day count so the UI can flag thin coverage.
     */
    public function calendar(Request $request): JsonResponse
    {
        $data = $request->validate([
            'from' => ['required', 'date'],
            'to' => ['required', 'date', 'after_or_equal:from'],
            'branch_id' => ['nullable', 'exists:branches,id'],
            'department_id' => ['nullable', 'exists:departments,id'],
        ]);

        $from = Carbon::parse($data['from'])->startOfDay();
        $to = Carbon::parse($data['to'])->endOfDay();

        $requests = LeaveRequest::with('employee:id,first_name,last_name,photo_path,department_id', 'employee.department:id,name', 'type:id,name,color')
            ->whereIn('status', ['pending', 'approved'])
            ->where('date_from', '<=', $to->toDateString())
            ->where('date_to', '>=', $from->toDateString())
            ->when($data['branch_id'] ?? null, fn ($q, $v) => $q->where('branch_id', $v))
            ->when($data['department_id'] ?? null, fn ($q, $v) => $q->whereHas('employee', fn ($e) => $e->where('department_id', $v)))
            ->get();

        $entries = $requests->map(fn (LeaveRequest $r) => [
            'id' => $r->id,
            'employee' => $r->employee?->full_name,
            'employee_id' => $r->employee_id,
            'department' => $r->employee?->department?->name,
            'photo_url' => $r->employee?->photo_path ? asset('storage/' . $r->employee->photo_path) : null,
            'type' => $r->type?->name,
            'color' => $r->type?->color,
            'date_from' => $r->date_from->toDateString(),
            'date_to' => $r->date_to->toDateString(),
            'half_day' => $r->half_day,
            'days' => (float) $r->days,
            'status' => $r->status,
        ])->values();

        // Per-day headcount off, so the calendar can shade days where a
        // department is thin. Weekends are skipped — nobody is "on leave" then.
        $byDay = [];
        for ($d = $from->copy(); $d->lte($to); $d->addDay()) {
            if ($d->isWeekend()) {
                continue;
            }

            $day = $d->toDateString();
            $off = $requests->filter(fn ($r) => $r->date_from->lte($d) && $r->date_to->gte($d));

            $byDay[] = [
                'date' => $day,
                'count' => $off->count(),
                'departments' => $off->groupBy(fn ($r) => $r->employee?->department?->name ?? 'Unassigned')
                    ->map(fn ($rows, $name) => [
                        'name' => $name,
                        'count' => $rows->count(),
                        'thin' => $rows->count() >= self::COVERAGE_THRESHOLD,
                    ])->values(),
            ];
        }

        return response()->json([
            'threshold' => self::COVERAGE_THRESHOLD,
            'entries' => $entries,
            'days' => $byDay,
        ]);
    }

    /** Leave types management. */
    public function types(Request $request): JsonResponse
    {
        return response()->json([
            'data' => LeaveType::where('company_id', $request->user()->company_id)->orderBy('name')->get(),
        ]);
    }

    public function saveType(Request $request): JsonResponse
    {
        $data = $request->validate([
            'id' => ['nullable', 'integer'],
            'name' => ['required', 'string', 'max:80'],
            'code' => ['required', 'string', 'max:20'],
            'default_days' => ['required', 'integer', 'min:0', 'max:365'],
            'is_paid' => ['boolean'],
            'color' => ['nullable', 'string', 'max:20'],
            'is_active' => ['boolean'],
        ]);

        $companyId = $request->user()->company_id;
        $type = ! empty($data['id'])
            ? tap(LeaveType::where('company_id', $companyId)->findOrFail($data['id']))->update(collect($data)->except('id')->all())
            : LeaveType::create(array_merge(collect($data)->except('id')->all(), ['company_id' => $companyId]));

        return response()->json(['message' => 'Leave type saved.', 'type' => $type->fresh()]);
    }

    /**
     * Act on the request's *current* approval step.
     *
     * A rejection at any level ends the request. An approval advances it; the
     * balance is only charged once the final level signs off.
     */
    public function act(Request $request, LeaveRequest $leave): JsonResponse
    {
        $data = $request->validate([
            'action' => ['required', 'in:approve,reject'],
            'remarks' => ['nullable', 'string', 'max:255'],
        ]);

        if ($leave->status !== 'pending') {
            return response()->json(['message' => 'This request was already ' . $leave->status . '.'], 422);
        }

        $leave->load('approvals', 'type');
        $step = $leave->currentApproval();

        if (! $step) {
            return response()->json(['message' => 'This request has no pending approval step.'], 422);
        }

        $user = $request->user();

        // A step naming a specific approver is theirs to act on — only a
        // SuperAdmin may act over their head.
        if ($step->approver_id && $step->approver_id !== $user->id && ! $user->isSuperAdmin()) {
            return response()->json([
                'message' => 'This request is waiting on ' . ($step->approver?->name ?? 'another approver') . '.',
            ], 403);
        }

        $approved = $data['action'] === 'approve';
        $employee = Employee::withoutGlobalScopes()->find($leave->employee_id);
        $before = Auditor::before($leave);

        DB::transaction(function () use ($leave, $step, $approved, $data, $user, $employee) {
            $step->update([
                'status' => $approved ? 'approved' : 'rejected',
                'acted_by' => $user->id,
                'acted_at' => now(),
                'remarks' => $data['remarks'] ?? null,
            ]);

            if (! $approved) {
                $leave->approvals()->where('status', 'pending')->update(['status' => 'skipped']);
                $leave->update([
                    'status' => 'rejected',
                    'current_level' => null,
                    'acted_by' => $user->id,
                    'acted_at' => now(),
                    'remarks' => $data['remarks'] ?? null,
                ]);

                return;
            }

            $next = $leave->approvals()->where('level', '>', $step->level)->where('status', 'pending')->orderBy('level')->first();

            if ($next) {
                $leave->update(['current_level' => $next->level]);

                return;
            }

            // Final sign-off — charge the balance now, not before.
            $balance = LeaveBalance::current($leave->employee_id, $leave->type);
            $balance->increment('used', (float) $leave->days);

            $leave->update([
                'status' => 'approved',
                'current_level' => null,
                'acted_by' => $user->id,
                'acted_at' => now(),
                'remarks' => $data['remarks'] ?? null,
            ]);
        });

        $leave->refresh()->load('approvals.approver', 'approvals.actor', 'type', 'employee', 'actor');

        // Still in flight? Ping whoever is next. Otherwise tell the employee.
        if ($leave->status === 'pending') {
            $this->notifyCurrentApprover($leave, $employee);
        } elseif ($employee?->user_id) {
            Notifier::toUser($employee->user_id, [
                'type' => 'leave',
                'title' => 'Leave ' . $leave->status . ': ' . $leave->type?->name,
                'body' => $leave->date_from->format('M j') . ' – ' . $leave->date_to->format('M j')
                    . ($data['remarks'] ?? null ? ' · ' . $data['remarks'] : ''),
                'link' => '/ess/leave',
                'icon' => $approved ? 'check' : 'x',
            ]);
        }

        Auditor::record(
            'leave',
            $approved ? 'approved' : 'rejected',
            $step->label . ' ' . ($approved ? 'approved' : 'rejected') . ' · ' . ($employee?->full_name ?? 'employee') . ' · '
                . $leave->date_from->format('M j') . ' – ' . $leave->date_to->format('M j') . " ({$leave->days} day(s))",
            $leave,
            Auditor::diff($leave, $before),
            $leave->branch_id,
        );

        $message = $leave->status === 'pending'
            ? $step->label . ' approved — now with ' . ($leave->currentApproval()?->label ?? 'the next approver') . '.'
            : 'Request ' . $leave->status . '.';

        return response()->json([
            'message' => $message,
            'request' => $this->shape($leave, admin: true),
        ]);
    }

    // ------------------------------------------------------------ Internals

    /**
     * Supervisor → HR. The supervisor step is only created when the employee
     * actually has a manager with a login; otherwise HR is the single level, so
     * a request never stalls waiting on a person who can't act.
     */
    private function buildApprovalChain(LeaveRequest $leave, Employee $employee): void
    {
        $level = 1;

        $manager = $employee->manager_id
            ? Employee::withoutGlobalScopes()->find($employee->manager_id)
            : null;

        if ($manager?->user_id) {
            LeaveApproval::create([
                'leave_request_id' => $leave->id,
                'level' => $level,
                'role' => 'supervisor',
                'label' => 'Supervisor',
                'approver_id' => $manager->user_id,
            ]);
            $level++;
        }

        LeaveApproval::create([
            'leave_request_id' => $leave->id,
            'level' => $level,
            'role' => 'hr',
            'label' => 'HR / Branch Manager',
            'approver_id' => null, // anyone holding leave.approve
        ]);

        $leave->update(['current_level' => 1]);
    }

    private function notifyCurrentApprover(LeaveRequest $leave, ?Employee $employee): void
    {
        $step = $leave->currentApproval();
        if (! $step) {
            return;
        }

        $body = ($employee?->full_name ?? 'An employee') . ' · '
            . $leave->date_from->format('M j') . ' – ' . $leave->date_to->format('M j')
            . " ({$leave->days} day(s))";

        $payload = [
            'type' => 'leave',
            'title' => 'Leave request needs your approval',
            'body' => $body,
            'link' => '/app/leave',
            'icon' => 'calendar-clock',
        ];

        if ($step->approver_id) {
            Notifier::toUser($step->approver_id, $payload);

            return;
        }

        // The HR step isn't owned by one person — tell everyone who can approve.
        $approvers = User::where('company_id', $employee?->company_id ?? $leave->employee?->company_id)
            ->where('is_active', true)->get()
            ->filter(fn (User $u) => $u->canModule('leave', 'approve'))
            ->pluck('id');

        Notifier::toUsers($approvers, $payload);
    }

    /**
     * Advisory warning when a request would leave a department thin on a day.
     * Never blocks — HR decides.
     */
    private function coverageWarning(Employee $employee, Carbon $from, Carbon $to, int $exceptId): ?string
    {
        if (! $employee->department_id) {
            return null;
        }

        $others = LeaveRequest::withoutGlobalScopes()
            ->where('id', '!=', $exceptId)
            ->whereIn('status', ['pending', 'approved'])
            ->where('date_from', '<=', $to->toDateString())
            ->where('date_to', '>=', $from->toDateString())
            ->whereHas('employee', fn ($e) => $e->where('department_id', $employee->department_id))
            ->with('employee:id,first_name,last_name')
            ->get();

        if ($others->count() < self::COVERAGE_THRESHOLD) {
            return null;
        }

        $names = $others->take(3)->map(fn ($r) => $r->employee?->first_name)->filter()->implode(', ');

        return $others->count() . ' other people in your department are already off on those dates'
            . ($names ? " ({$names})" : '') . '. HR may ask you to move them.';
    }

    private function shape(LeaveRequest $r, bool $admin = false): array
    {
        $base = [
            'id' => $r->id,
            'type' => $r->type?->name,
            'type_color' => $r->type?->color,
            'date_from' => $r->date_from->toDateString(),
            'date_to' => $r->date_to->toDateString(),
            'half_day' => $r->half_day,
            'days' => (float) $r->days,
            'reason' => $r->reason,
            'attachment_url' => $r->attachmentUrl(),
            'attachment_name' => $r->attachment_name,
            'status' => $r->status,
            'current_level' => $r->current_level,
            'remarks' => $r->remarks,
            'acted_at' => $r->acted_at?->toIso8601String(),
            'created_at' => $r->created_at->toIso8601String(),
            // The status timeline: submitted → each approval step → settled.
            'approvals' => $r->relationLoaded('approvals')
                ? $r->approvals->map(fn (LeaveApproval $a) => [
                    'level' => $a->level,
                    'role' => $a->role,
                    'label' => $a->label,
                    'status' => $a->status,
                    'approver' => $a->approver?->name,
                    'acted_by' => $a->actor?->name,
                    'remarks' => $a->remarks,
                    'acted_at' => $a->acted_at?->toIso8601String(),
                    'is_current' => $a->level === $r->current_level && $r->status === 'pending',
                ])->values()
                : [],
        ];

        if ($admin) {
            $base['employee'] = $r->employee ? [
                'id' => $r->employee->id,
                'name' => $r->employee->full_name,
                'position' => $r->employee->position?->title,
                'photo_url' => $r->employee->photo_path ? asset('storage/' . $r->employee->photo_path) : null,
            ] : null;
            $base['acted_by'] = $r->actor?->name;
            $base['waiting_on'] = $r->status === 'pending'
                ? ($r->currentApproval()?->label ?? null)
                : null;
        }

        return $base;
    }
}
