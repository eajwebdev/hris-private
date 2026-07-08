<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\ServiceCredit;
use App\Models\Setting;
use App\Services\Notifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ServiceCreditController extends Controller
{
    private function currentEmployee(Request $request): Employee
    {
        $employee = Employee::withoutGlobalScopes()->where('user_id', $request->user()->id)->first();
        abort_unless($employee, 422, 'Your login isn’t linked to an employee record. Ask HR to connect it.');

        return $employee;
    }

    private function annualCap(): float
    {
        return (float) Setting::get('service_credit_annual_cap', 15);
    }

    /** Available = approved balance − credits reserved by still-pending use requests. */
    private function available(int $employeeId): float
    {
        $pendingUse = (float) ServiceCredit::withoutGlobalScopes()
            ->where('employee_id', $employeeId)->where('entry_type', 'use')->where('status', 'pending')
            ->sum('days');

        return ServiceCredit::balanceFor($employeeId) - $pendingUse;
    }

    // ---------------------------------------------------------------- ESS

    public function my(Request $request): JsonResponse
    {
        $employee = $this->currentEmployee($request);

        $entries = ServiceCredit::withoutGlobalScopes()->with('actor:id,name')
            ->where('employee_id', $employee->id)
            ->orderByDesc('created_at')->limit(60)->get()
            ->map(fn ($c) => $this->shape($c));

        return response()->json([
            'balance' => ServiceCredit::balanceFor($employee->id),
            'available' => $this->available($employee->id),
            'earned_this_year' => ServiceCredit::earnedThisYear($employee->id),
            'annual_cap' => $this->annualCap(),
            'entries' => $entries,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $employee = $this->currentEmployee($request);

        $data = $request->validate([
            'entry_type' => ['required', 'in:earn,use'],
            'days' => ['required', 'numeric', 'min:0.5', 'max:30'],
            'service_date' => ['required', 'date'],
            'reason' => ['nullable', 'string', 'max:1000'],
        ]);

        if ($data['entry_type'] === 'earn') {
            $projected = ServiceCredit::earnedThisYear($employee->id) + $data['days'];
            if ($projected > $this->annualCap()) {
                return response()->json(['message' => "This exceeds the {$this->annualCap()}-day annual service-credit cap."], 422);
            }
        } else {
            if ($data['days'] > $this->available($employee->id)) {
                return response()->json(['message' => 'Not enough service-credit balance — ' . $this->available($employee->id) . ' day(s) available.'], 422);
            }
        }

        $credit = ServiceCredit::create([
            'employee_id' => $employee->id,
            'branch_id' => $employee->branch_id,
            'entry_type' => $data['entry_type'],
            'days' => $data['days'],
            'service_date' => $data['service_date'],
            'reason' => $data['reason'] ?? null,
            'source' => 'request',
        ]);

        $verb = $data['entry_type'] === 'earn' ? 'credit' : 'use';
        return response()->json(['message' => "Service-credit {$verb} request filed for {$data['days']} day(s).", 'entry' => $this->shape($credit)], 201);
    }

    public function cancel(Request $request, int $id): JsonResponse
    {
        $employee = $this->currentEmployee($request);
        $credit = ServiceCredit::withoutGlobalScopes()
            ->where('employee_id', $employee->id)->where('status', 'pending')->findOrFail($id);

        $credit->update(['status' => 'cancelled', 'acted_at' => now()]);

        return response()->json(['message' => 'Request cancelled.']);
    }

    // -------------------------------------------------------------- Admin

    public function index(Request $request)
    {
        $q = ServiceCredit::with('employee:id,first_name,last_name,photo_path', 'employee.position:id,title', 'actor:id,name')
            ->when($request->filled('status'), fn ($w) => $w->where('status', $request->string('status')))
            ->when($request->filled('entry_type'), fn ($w) => $w->where('entry_type', $request->string('entry_type')))
            ->when($request->filled('branch_id'), fn ($w) => $w->where('branch_id', $request->integer('branch_id')))
            ->orderByRaw("case when status = 'pending' then 0 else 1 end")
            ->orderByDesc('created_at');

        $page = $q->paginate($request->integer('per_page', 15));
        $page->getCollection()->transform(fn ($c) => $this->shape($c, admin: true));

        return $page;
    }

    /** HR directly grants credits to an employee (auto-approved earn). */
    public function grant(Request $request): JsonResponse
    {
        $data = $request->validate([
            'employee_id' => ['required', 'exists:employees,id'],
            'days' => ['required', 'numeric', 'min:0.5', 'max:30'],
            'service_date' => ['required', 'date'],
            'reason' => ['nullable', 'string', 'max:1000'],
        ]);

        $employee = Employee::withoutGlobalScopes()->findOrFail($data['employee_id']);

        $projected = ServiceCredit::earnedThisYear($employee->id) + $data['days'];
        if ($projected > $this->annualCap()) {
            return response()->json(['message' => "This exceeds the {$this->annualCap()}-day annual cap for {$employee->full_name}."], 422);
        }

        $credit = ServiceCredit::create([
            'employee_id' => $employee->id,
            'branch_id' => $employee->branch_id,
            'entry_type' => 'earn',
            'days' => $data['days'],
            'service_date' => $data['service_date'],
            'reason' => $data['reason'] ?? null,
            'status' => 'approved',
            'source' => 'grant',
            'acted_by' => $request->user()->id,
            'acted_at' => now(),
        ]);

        $this->notifyEmployee($employee, "Service credits granted: {$data['days']} day(s)", $data['reason'] ?? '');

        return response()->json(['message' => "Granted {$data['days']} day(s) to {$employee->full_name}.", 'entry' => $this->shape($credit->fresh()->load('employee', 'actor'), admin: true)], 201);
    }

    public function act(Request $request, ServiceCredit $credit): JsonResponse
    {
        $data = $request->validate([
            'action' => ['required', 'in:approve,reject'],
            'remarks' => ['nullable', 'string', 'max:255'],
        ]);

        if ($credit->status !== 'pending') {
            return response()->json(['message' => 'This request was already ' . $credit->status . '.'], 422);
        }

        $approved = $data['action'] === 'approve';

        if ($approved && $credit->entry_type === 'use') {
            if ((float) $credit->days > ServiceCredit::balanceFor($credit->employee_id)) {
                return response()->json(['message' => 'Balance is now insufficient to approve this use.'], 422);
            }
        }
        if ($approved && $credit->entry_type === 'earn') {
            $projected = ServiceCredit::earnedThisYear($credit->employee_id) + (float) $credit->days;
            if ($projected > $this->annualCap()) {
                return response()->json(['message' => "Approving this exceeds the {$this->annualCap()}-day annual cap."], 422);
            }
        }

        $credit->update([
            'status' => $approved ? 'approved' : 'rejected',
            'acted_by' => $request->user()->id,
            'acted_at' => now(),
            'remarks' => $data['remarks'] ?? null,
        ]);

        $employee = Employee::withoutGlobalScopes()->find($credit->employee_id);
        $label = ($credit->entry_type === 'earn' ? 'Credit' : 'Use') . ' request ' . $credit->status;
        $this->notifyEmployee($employee, $label . ": {$credit->days} day(s)", $data['remarks'] ?? '');

        return response()->json(['message' => 'Request ' . $credit->status . '.', 'entry' => $this->shape($credit->fresh()->load('employee', 'actor'), admin: true)]);
    }

    private function notifyEmployee(?Employee $employee, string $title, string $body): void
    {
        if ($employee?->user_id) {
            Notifier::toUser($employee->user_id, [
                'type' => 'service_credit',
                'title' => $title,
                'body' => $body ?: null,
                'link' => '/ess/credits',
                'icon' => 'gift',
            ]);
        }
    }

    private function shape(ServiceCredit $c, bool $admin = false): array
    {
        $base = [
            'id' => $c->id,
            'entry_type' => $c->entry_type,
            'days' => (float) $c->days,
            'service_date' => $c->service_date->toDateString(),
            'reason' => $c->reason,
            'status' => $c->status,
            'source' => $c->source,
            'remarks' => $c->remarks,
            'acted_at' => $c->acted_at?->toIso8601String(),
            'created_at' => $c->created_at->toIso8601String(),
        ];

        if ($admin) {
            $base['employee'] = $c->employee ? [
                'id' => $c->employee->id,
                'name' => $c->employee->full_name,
                'position' => $c->employee->position?->title,
                'photo_url' => $c->employee->photo_path ? asset('storage/' . $c->employee->photo_path) : null,
            ] : null;
            $base['acted_by'] = $c->actor?->name;
        }

        return $base;
    }
}
