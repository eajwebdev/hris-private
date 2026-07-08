<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\LeaveBalance;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Services\Notifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class LeaveController extends Controller
{
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

        $requests = LeaveRequest::withoutGlobalScopes()->with('type:id,name,color')
            ->where('employee_id', $employee->id)
            ->orderByDesc('created_at')->limit(50)->get()
            ->map(fn ($r) => $this->shape($r));

        return response()->json(['balances' => $balances, 'requests' => $requests]);
    }

    /** File a leave request (ESS). */
    public function store(Request $request): JsonResponse
    {
        $employee = $this->currentEmployee($request);

        $data = $request->validate([
            'leave_type_id' => ['required', 'exists:leave_types,id'],
            'date_from' => ['required', 'date', 'after_or_equal:today'],
            'date_to' => ['required', 'date', 'after_or_equal:date_from'],
            'reason' => ['nullable', 'string', 'max:1000'],
        ]);

        $type = LeaveType::findOrFail($data['leave_type_id']);
        $days = LeaveRequest::workingDays(Carbon::parse($data['date_from']), Carbon::parse($data['date_to']));
        if ($days < 1) {
            return response()->json(['message' => 'The selected range has no working days.'], 422);
        }

        $balance = LeaveBalance::current($employee->id, $type);
        if ($days > $balance->remaining) {
            return response()->json(['message' => "Not enough {$type->name} balance — {$balance->remaining} day(s) left, {$days} requested."], 422);
        }

        // Guard against overlapping pending/approved requests.
        $overlap = LeaveRequest::withoutGlobalScopes()
            ->where('employee_id', $employee->id)
            ->whereIn('status', ['pending', 'approved'])
            ->where('date_from', '<=', $data['date_to'])
            ->where('date_to', '>=', $data['date_from'])
            ->exists();
        if ($overlap) {
            return response()->json(['message' => 'You already have a leave request covering those dates.'], 422);
        }

        $leave = LeaveRequest::create([
            'employee_id' => $employee->id,
            'branch_id' => $employee->branch_id,
            'leave_type_id' => $type->id,
            'date_from' => $data['date_from'],
            'date_to' => $data['date_to'],
            'days' => $days,
            'reason' => $data['reason'] ?? null,
        ]);

        return response()->json(['message' => "Leave request filed — {$days} working day(s) of {$type->name}.", 'request' => $this->shape($leave->load('type'))], 201);
    }

    /** Cancel my own pending request (ESS). */
    public function cancel(Request $request, int $id): JsonResponse
    {
        $employee = $this->currentEmployee($request);
        $leave = LeaveRequest::withoutGlobalScopes()
            ->where('employee_id', $employee->id)->where('status', 'pending')->findOrFail($id);

        $leave->update(['status' => 'cancelled', 'acted_at' => now()]);

        return response()->json(['message' => 'Leave request cancelled.']);
    }

    // -------------------------------------------------------------- Admin

    /** HR list with filters (branch-scoped via global scope). */
    public function index(Request $request)
    {
        $q = LeaveRequest::with('employee:id,first_name,last_name,photo_path', 'employee.position:id,title', 'type:id,name,color', 'actor:id,name')
            ->when($request->filled('status'), fn ($w) => $w->where('status', $request->string('status')))
            ->when($request->filled('branch_id'), fn ($w) => $w->where('branch_id', $request->integer('branch_id')))
            ->orderByRaw("case when status = 'pending' then 0 else 1 end")
            ->orderByDesc('created_at');

        $page = $q->paginate($request->integer('per_page', 20));
        $page->getCollection()->transform(fn ($r) => $this->shape($r, admin: true));

        return $page;
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

    /** Approve or reject (module:leave,approve). */
    public function act(Request $request, LeaveRequest $leave): JsonResponse
    {
        $data = $request->validate([
            'action' => ['required', 'in:approve,reject'],
            'remarks' => ['nullable', 'string', 'max:255'],
        ]);

        if ($leave->status !== 'pending') {
            return response()->json(['message' => 'This request was already ' . $leave->status . '.'], 422);
        }

        $approved = $data['action'] === 'approve';

        if ($approved) {
            $balance = LeaveBalance::current($leave->employee_id, $leave->type);
            if ((float) $leave->days > $balance->remaining) {
                return response()->json(['message' => "Balance is now insufficient — {$balance->remaining} day(s) left."], 422);
            }
            $balance->increment('used', (float) $leave->days);
        }

        $leave->update([
            'status' => $approved ? 'approved' : 'rejected',
            'acted_by' => $request->user()->id,
            'acted_at' => now(),
            'remarks' => $data['remarks'] ?? null,
        ]);

        // Tell the employee.
        $employee = Employee::withoutGlobalScopes()->find($leave->employee_id);
        if ($employee?->user_id) {
            Notifier::toUser($employee->user_id, [
                'type' => 'leave',
                'title' => 'Leave ' . $leave->status . ': ' . $leave->type->name,
                'body' => $leave->date_from->format('M j') . ' – ' . $leave->date_to->format('M j') .
                    ($data['remarks'] ?? null ? ' · ' . $data['remarks'] : ''),
                'link' => '/ess/leave',
                'icon' => $approved ? 'check' : 'x',
            ]);
        }

        return response()->json(['message' => 'Request ' . $leave->status . '.', 'request' => $this->shape($leave->fresh(['type', 'employee', 'actor']), admin: true)]);
    }

    private function shape(LeaveRequest $r, bool $admin = false): array
    {
        $base = [
            'id' => $r->id,
            'type' => $r->type?->name,
            'type_color' => $r->type?->color,
            'date_from' => $r->date_from->toDateString(),
            'date_to' => $r->date_to->toDateString(),
            'days' => (float) $r->days,
            'reason' => $r->reason,
            'status' => $r->status,
            'remarks' => $r->remarks,
            'acted_at' => $r->acted_at?->toIso8601String(),
            'created_at' => $r->created_at->toIso8601String(),
        ];

        if ($admin) {
            $base['employee'] = $r->employee ? [
                'id' => $r->employee->id,
                'name' => $r->employee->full_name,
                'position' => $r->employee->position?->title,
                'photo_url' => $r->employee->photo_path ? asset('storage/' . $r->employee->photo_path) : null,
            ] : null;
            $base['acted_by'] = $r->actor?->name;
        }

        return $base;
    }
}
