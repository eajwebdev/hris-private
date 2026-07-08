<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\PayrollPeriod;
use App\Models\Payslip;
use App\Services\Notifier;
use App\Services\PayrollService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PayrollController extends Controller
{
    public function __construct(private PayrollService $service) {}

    /** Payroll periods, newest first. */
    public function index(Request $request): JsonResponse
    {
        $periods = PayrollPeriod::with('branch:id,name', 'generator:id,name')
            ->withCount('payslips')
            ->withSum('payslips as total_net', 'net_pay')
            ->where('company_id', $request->user()->company_id)
            ->when(! $request->user()->is_super_admin,
                fn ($q) => $q->where(fn ($w) => $w->whereNull('branch_id')->orWhereIn('branch_id', $request->user()->accessibleBranchIds())))
            ->orderByDesc('period_start')
            ->get()->map(fn ($p) => $this->shapePeriod($p));

        return response()->json(['data' => $periods]);
    }

    /** Create a draft period and compute payslips from attendance + leave. */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'period_start' => ['required', 'date'],
            'period_end' => ['required', 'date', 'after_or_equal:period_start'],
            'branch_id' => ['nullable', 'exists:branches,id'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        $exists = PayrollPeriod::where('company_id', $request->user()->company_id)
            ->where('branch_id', $data['branch_id'] ?? null)
            ->where('period_start', $data['period_start'])
            ->where('period_end', $data['period_end'])
            ->exists();
        if ($exists) {
            return response()->json(['message' => 'A payroll run for that exact period already exists.'], 422);
        }

        $period = PayrollPeriod::create(array_merge($data, [
            'company_id' => $request->user()->company_id,
            'generated_by' => $request->user()->id,
        ]));

        $period = $this->service->generate($period);

        return response()->json([
            'message' => 'Draft payroll generated for ' . $period->payslips->count() . ' employee(s).',
            'period' => $this->shapePeriod($period->loadCount('payslips')->loadSum('payslips as total_net', 'net_pay')->load('branch', 'generator')),
        ], 201);
    }

    /** A period's payslips. */
    public function show(Request $request, PayrollPeriod $period): JsonResponse
    {
        abort_unless($period->company_id === $request->user()->company_id, 404);

        $slips = $period->payslips()->with('employee:id,first_name,last_name,employee_no,photo_path', 'employee.position:id,title')
            ->get()->map(fn ($p) => $this->shapeSlip($p, admin: true));

        return response()->json([
            'period' => $this->shapePeriod($period->loadCount('payslips')->loadSum('payslips as total_net', 'net_pay')->load('branch', 'generator')),
            'payslips' => $slips,
        ]);
    }

    /** Recompute a draft (e.g. after attendance corrections). */
    public function regenerate(Request $request, PayrollPeriod $period): JsonResponse
    {
        abort_unless($period->company_id === $request->user()->company_id, 404);
        if ($period->status !== 'draft') {
            return response()->json(['message' => 'Finalized payroll can’t be recomputed.'], 422);
        }

        $this->service->generate($period);

        return response()->json(['message' => 'Payroll recomputed.']);
    }

    /** Lock the period and release payslips to employees. */
    public function finalize(Request $request, PayrollPeriod $period): JsonResponse
    {
        abort_unless($period->company_id === $request->user()->company_id, 404);
        if ($period->status !== 'draft') {
            return response()->json(['message' => 'This period is already finalized.'], 422);
        }

        $period->update(['status' => 'finalized', 'finalized_at' => now()]);

        // Notify employees their payslip is ready.
        $userIds = Employee::withoutGlobalScopes()
            ->whereIn('id', $period->payslips()->pluck('employee_id'))
            ->whereNotNull('user_id')->pluck('user_id');

        Notifier::toUsers($userIds, [
            'type' => 'payroll',
            'title' => 'Your payslip is ready',
            'body' => $period->period_start->format('M j') . ' – ' . $period->period_end->format('M j, Y'),
            'link' => '/ess/payslips',
            'icon' => 'wallet',
        ]);

        return response()->json(['message' => 'Payroll finalized — employees can now view their payslips.']);
    }

    /** Delete a draft run. */
    public function destroy(Request $request, PayrollPeriod $period): JsonResponse
    {
        abort_unless($period->company_id === $request->user()->company_id, 404);
        if ($period->status !== 'draft') {
            return response()->json(['message' => 'Finalized payroll can’t be deleted.'], 422);
        }
        $period->delete();

        return response()->json(['message' => 'Draft payroll deleted.']);
    }

    /** ESS — my finalized payslips. */
    public function my(Request $request): JsonResponse
    {
        $employee = Employee::withoutGlobalScopes()->where('user_id', $request->user()->id)->first();
        abort_unless($employee, 422, 'Your login isn’t linked to an employee record.');

        $slips = Payslip::with('period:id,period_start,period_end,status,finalized_at')
            ->where('employee_id', $employee->id)
            ->whereHas('period', fn ($q) => $q->where('status', 'finalized'))
            ->get()
            ->sortByDesc(fn ($p) => $p->period->period_start)
            ->values()
            ->map(fn ($p) => $this->shapeSlip($p));

        return response()->json(['data' => $slips]);
    }

    private function shapePeriod(PayrollPeriod $p): array
    {
        return [
            'id' => $p->id,
            'branch_id' => $p->branch_id,
            'branch' => $p->branch?->name ?? 'All branches',
            'period_start' => $p->period_start->toDateString(),
            'period_end' => $p->period_end->toDateString(),
            'status' => $p->status,
            'note' => $p->note,
            'payslips_count' => $p->payslips_count ?? 0,
            'total_net' => (float) ($p->total_net ?? 0),
            'generated_by' => $p->generator?->name,
            'finalized_at' => $p->finalized_at?->toIso8601String(),
            'created_at' => $p->created_at->toIso8601String(),
        ];
    }

    private function shapeSlip(Payslip $p, bool $admin = false): array
    {
        $base = [
            'id' => $p->id,
            'basic_salary' => (float) $p->basic_salary,
            'daily_rate' => (float) $p->daily_rate,
            'days_present' => (float) $p->days_present,
            'paid_leave_days' => (float) $p->paid_leave_days,
            'service_credit_days' => (float) $p->service_credit_days,
            'late_minutes' => $p->late_minutes,
            'undertime_minutes' => $p->undertime_minutes,
            'early_out_minutes' => $p->early_out_minutes,
            'gross_pay' => (float) $p->gross_pay,
            'late_deduction' => (float) $p->late_deduction,
            'net_pay' => (float) $p->net_pay,
        ];

        if ($admin) {
            $base['employee'] = $p->employee ? [
                'id' => $p->employee->id,
                'name' => $p->employee->full_name,
                'employee_no' => $p->employee->employee_no,
                'position' => $p->employee->position?->title,
                'photo_url' => $p->employee->photo_path ? asset('storage/' . $p->employee->photo_path) : null,
            ] : null;
        } else {
            $base['period'] = $p->period ? [
                'start' => $p->period->period_start->toDateString(),
                'end' => $p->period->period_end->toDateString(),
            ] : null;
        }

        return $base;
    }
}
