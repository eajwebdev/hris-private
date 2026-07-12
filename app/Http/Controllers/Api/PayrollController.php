<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\PayrollComponent;
use App\Models\PayrollPeriod;
use App\Models\Payslip;
use App\Models\Setting;
use App\Services\Auditor;
use App\Services\Notifier;
use App\Services\PayrollService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

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

        $slips = $period->payslips()->with('employee:id,first_name,last_name,employee_no,photo_path', 'employee.position:id,title', 'lines')
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

        Auditor::record(
            'payroll',
            'finalized',
            'Finalized payroll for ' . $period->period_start->format('M j') . ' – ' . $period->period_end->format('M j, Y')
                . ' (' . $period->payslips()->count() . ' payslip(s)).',
            $period,
            null,
            $period->branch_id,
        );

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

        $slips = Payslip::with('period:id,period_start,period_end,status,finalized_at', 'lines')
            ->where('employee_id', $employee->id)
            ->whereHas('period', fn ($q) => $q->where('status', 'finalized'))
            ->get()
            ->sortByDesc(fn ($p) => $p->period->period_start)
            ->values()
            ->map(fn ($p) => $this->shapeSlip($p));

        return response()->json(['data' => $slips]);
    }

    // ------------------------------------------------- Salary components

    /**
     * The company's earning/deduction columns. HR defines these freely — the
     * statutory ones are just seeded rows, not special cases in the code.
     */
    public function components(Request $request): JsonResponse
    {
        $components = PayrollComponent::with('branch:id,name')
            ->where('company_id', $request->user()->company_id)
            ->orderBy('type')->orderBy('sort_order')->orderBy('id')
            ->get()->map(fn ($c) => $this->shapeComponent($c));

        return response()->json([
            'data' => $components,
            'types' => collect(PayrollComponent::TYPES)->map(fn ($l, $v) => ['value' => $v, 'label' => $l])->values(),
            'calcs' => collect(PayrollComponent::CALCS)->map(fn ($l, $v) => ['value' => $v, 'label' => $l])->values(),
        ]);
    }

    public function storeComponent(Request $request): JsonResponse
    {
        $data = $this->validateComponent($request);

        $component = PayrollComponent::create(array_merge($data, [
            'company_id' => $request->user()->company_id,
        ]));

        Auditor::record('payroll', 'created', "Added {$component->type} component “{$component->name}”.", $component);

        return response()->json([
            'message' => ucfirst($component->type) . " “{$component->name}” added.",
            'component' => $this->shapeComponent($component->load('branch')),
        ], 201);
    }

    public function updateComponent(Request $request, PayrollComponent $component): JsonResponse
    {
        abort_unless($component->company_id === $request->user()->company_id, 404);

        $before = Auditor::before($component);
        $component->update($this->validateComponent($request, $component));

        Auditor::record('payroll', 'updated', "Updated component “{$component->name}”.", $component, Auditor::diff($component, $before));

        return response()->json([
            'message' => "“{$component->name}” saved.",
            'component' => $this->shapeComponent($component->fresh('branch')),
        ]);
    }

    public function destroyComponent(Request $request, PayrollComponent $component): JsonResponse
    {
        abort_unless($component->company_id === $request->user()->company_id, 404);

        Auditor::record('payroll', 'deleted', "Removed component “{$component->name}”.", $component);

        $component->delete();

        // Payslips already generated keep their snapshotted lines — see PayslipLine.
        return response()->json(['message' => 'Component removed. Payslips already generated are unchanged.']);
    }

    /** What applies to one employee, with any per-employee overrides. */
    public function employeeComponents(Request $request, Employee $employee): JsonResponse
    {
        $components = PayrollComponent::where('company_id', $request->user()->company_id)
            ->where('is_active', true)
            ->where(fn ($q) => $q->whereNull('branch_id')->orWhere('branch_id', $employee->branch_id))
            ->orderBy('type')->orderBy('sort_order')
            ->get();

        $assigned = $employee->payrollComponents->keyBy('id');

        return response()->json([
            'employee' => [
                'id' => $employee->id,
                'name' => $employee->full_name,
                'basic_salary' => (float) $employee->basic_salary,
            ],
            'data' => $components->map(function (PayrollComponent $c) use ($assigned) {
                $pivot = $assigned->get($c->id)?->pivot;

                return array_merge($this->shapeComponent($c), [
                    'assigned' => (bool) $pivot,
                    'applies' => $pivot ? (bool) $pivot->is_active : $c->applies_to_all,
                    'override_amount' => $pivot?->amount !== null ? (float) $pivot->amount : null,
                ]);
            })->values(),
        ]);
    }

    /** Assign, override, or switch off components for one employee. */
    public function saveEmployeeComponents(Request $request, Employee $employee): JsonResponse
    {
        $data = $request->validate([
            'components' => ['present', 'array'],
            'components.*.payroll_component_id' => ['required', 'exists:payroll_components,id'],
            'components.*.is_active' => ['required', 'boolean'],
            'components.*.amount' => ['nullable', 'numeric', 'min:0'],
        ]);

        $sync = [];
        foreach ($data['components'] as $row) {
            $sync[$row['payroll_component_id']] = [
                'is_active' => $row['is_active'],
                'amount' => $row['amount'] ?? null,
            ];
        }

        $employee->payrollComponents()->sync($sync);

        Auditor::record('payroll', 'updated', "Updated salary components for {$employee->full_name}.", $employee, null, $employee->branch_id);

        return response()->json(['message' => "Salary components saved for {$employee->full_name}."]);
    }

    // ------------------------------------------------------- Payslip PDF

    /** Render one payslip as a PDF. Employees may only fetch their own. */
    public function payslipPdf(Request $request, Payslip $payslip)
    {
        $user = $request->user();
        $payslip->load('employee.position', 'employee.branch', 'period', 'lines');

        $own = $payslip->employee?->user_id === $user->id;

        if ($own) {
            // An employee can only see a payslip that has actually been released.
            abort_unless($payslip->period?->status === 'finalized', 403, 'This payslip hasn’t been released yet.');
        } else {
            abort_unless($user->canModule('payroll', 'view'), 403);
            abort_unless(
                $user->isSuperAdmin() || in_array($payslip->branch_id, $user->accessibleBranchIds(), true),
                403
            );
        }

        $branding = Setting::branding();

        $pdf = Pdf::loadView('payroll.payslip', [
            'slip' => $payslip,
            'systemName' => $branding['system_name'],
            'brand' => $branding['vars']['brand'] ?: '#d61b5d',
            'generatedAt' => now()->format('M j, Y g:i A'),
        ])->setPaper('a4', 'portrait');

        $pdf->setOption('isFontSubsettingEnabled', true);

        $name = str($payslip->employee?->full_name ?? 'payslip')->slug()
            . '-' . $payslip->period?->period_end->format('Y-m-d') . '.pdf';

        return $request->boolean('download') ? $pdf->download($name) : $pdf->stream($name);
    }

    // ---------------------------------------------------------- Internals

    private function validateComponent(Request $request, ?PayrollComponent $existing = null): array
    {
        return $request->validate([
            'code' => [
                'required', 'string', 'max:30', 'alpha_dash',
                Rule::unique('payroll_components', 'code')
                    ->where('company_id', $request->user()->company_id)
                    ->ignore($existing?->id),
            ],
            'name' => ['required', 'string', 'max:80'],
            'type' => ['required', Rule::in(array_keys(PayrollComponent::TYPES))],
            'calc' => ['required', Rule::in(array_keys(PayrollComponent::CALCS))],
            'amount' => ['required', 'numeric', 'min:0'],
            'branch_id' => ['nullable', 'exists:branches,id'],
            'is_statutory' => ['boolean'],
            'is_active' => ['boolean'],
            'applies_to_all' => ['boolean'],
            'is_taxable' => ['boolean'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
        ]);
    }

    private function shapeComponent(PayrollComponent $c): array
    {
        return [
            'id' => $c->id,
            'code' => $c->code,
            'name' => $c->name,
            'type' => $c->type,
            'calc' => $c->calc,
            'calc_label' => PayrollComponent::CALCS[$c->calc] ?? $c->calc,
            'amount' => (float) $c->amount,
            'branch_id' => $c->branch_id,
            'branch' => $c->branch?->name,
            'is_statutory' => $c->is_statutory,
            'is_active' => $c->is_active,
            'applies_to_all' => $c->applies_to_all,
            'is_taxable' => $c->is_taxable,
            'sort_order' => $c->sort_order,
        ];
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
            'total_earnings' => (float) $p->total_earnings,
            'late_deduction' => (float) $p->late_deduction,
            'total_deductions' => (float) $p->total_deductions,
            'net_pay' => (float) $p->net_pay,
            'lines' => $p->relationLoaded('lines') ? $p->lines->map(fn ($l) => [
                'code' => $l->code,
                'name' => $l->name,
                'type' => $l->type,
                'amount' => (float) $l->amount,
            ])->values() : [],
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
