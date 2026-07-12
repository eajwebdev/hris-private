<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\LeaveRequest;
use App\Models\PayrollComponent;
use App\Models\PayrollPeriod;
use App\Models\Payslip;
use App\Models\ServiceCredit;
use App\Models\Setting;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Payroll computation from attendance + approved paid leave, plus whatever
 * earning/deduction components HR has defined.
 *
 *   daily rate   = monthly basic ÷ working-days-per-month (setting, default 22)
 *   per-minute   = daily ÷ 8h ÷ 60
 *   gross        = daily × (days present + paid leave + service-credit days)
 *   late deduct  = (late + undertime + early-out minutes) × per-minute
 *   earnings     = Σ earning components (allowances, bonuses…)
 *   deductions   = late deduction + Σ deduction components (SSS, loans…)
 *   net          = gross + earnings − deductions
 *
 * The component set is entirely user-defined — see PayrollComponent. Each
 * resolved component is snapshotted onto the payslip as a PayslipLine, so
 * editing a component later never silently rewrites payroll that already ran.
 */
class PayrollService
{
    /** (Re)generate all payslips for a draft period. */
    public function generate(PayrollPeriod $period): PayrollPeriod
    {
        $divisor = max(1, (int) Setting::get('payroll_working_days', 22));

        $employees = Employee::withoutGlobalScopes()
            ->with('payrollComponents')
            ->whereIn('status', ['regular', 'probationary'])
            ->when($period->branch_id, fn ($q) => $q->where('branch_id', $period->branch_id))
            ->whereHas('branch', fn ($q) => $q->where('company_id', $period->company_id))
            ->get();

        // Active components for this company, narrowed to the period's branch.
        $components = PayrollComponent::where('company_id', $period->company_id)
            ->where('is_active', true)
            ->when($period->branch_id, fn ($q) => $q->where(fn ($w) => $w
                ->whereNull('branch_id')->orWhere('branch_id', $period->branch_id)))
            ->orderBy('sort_order')->orderBy('id')
            ->get();

        $from = $period->period_start->toDateString();
        $to = $period->period_end->toDateString();

        DB::transaction(function () use ($period, $employees, $components, $divisor, $from, $to) {
            // Cascades to payslip_lines.
            $period->payslips()->delete();

            foreach ($employees as $employee) {
                $rows = Attendance::withoutGlobalScopes()
                    ->where('employee_id', $employee->id)
                    ->whereBetween('work_date', [$from, $to])
                    ->get();

                $paidLeaveDays = $this->paidLeaveDays($employee->id, $period->period_start, $period->period_end);
                $serviceCreditDays = $this->serviceCreditDays($employee->id, $period->period_start, $period->period_end);

                $basic = (float) $employee->basic_salary;
                $daily = round($basic / $divisor, 2);
                $perMinute = $daily / 8 / 60;

                $daysPresent = (float) $rows->count();
                $lateMinutes = (int) $rows->sum(fn ($a) => $a->late_am_minutes + $a->late_pm_minutes);
                $undertime = (int) $rows->sum('undertime_minutes');
                $earlyOut = (int) $rows->sum('early_out_minutes');

                $gross = round($daily * ($daysPresent + $paidLeaveDays + $serviceCreditDays), 2);
                $lateDeduction = round(($lateMinutes + $undertime + $earlyOut) * $perMinute, 2);

                $lines = $this->resolveLines($employee, $components, $basic, $gross);

                $earnings = round(array_sum(array_map(
                    fn ($l) => $l['type'] === 'earning' ? $l['amount'] : 0, $lines
                )), 2);
                $componentDeductions = round(array_sum(array_map(
                    fn ($l) => $l['type'] === 'deduction' ? $l['amount'] : 0, $lines
                )), 2);

                $totalDeductions = round($lateDeduction + $componentDeductions, 2);

                $payslip = Payslip::create([
                    'payroll_period_id' => $period->id,
                    'employee_id' => $employee->id,
                    'branch_id' => $employee->branch_id,
                    'basic_salary' => $employee->basic_salary,
                    'daily_rate' => $daily,
                    'days_present' => $daysPresent,
                    'paid_leave_days' => $paidLeaveDays,
                    'service_credit_days' => $serviceCreditDays,
                    'late_minutes' => $lateMinutes,
                    'undertime_minutes' => $undertime,
                    'early_out_minutes' => $earlyOut,
                    'gross_pay' => $gross,
                    'total_earnings' => $earnings,
                    'late_deduction' => $lateDeduction,
                    'total_deductions' => $totalDeductions,
                    'net_pay' => round(max(0, $gross + $earnings - $totalDeductions), 2),
                ]);

                if ($lines) {
                    $payslip->lines()->createMany($lines);
                }
            }
        });

        return $period->fresh('payslips');
    }

    /**
     * Which components apply to this employee, and at what peso value.
     *
     * A component applies when it is company-wide (`applies_to_all`) or has been
     * explicitly assigned. Either way an assignment row can override the amount,
     * or switch the component off for this one employee (`is_active = false`).
     *
     * @return list<array{code: string, name: string, type: string, amount: float, sort_order: int}>
     */
    private function resolveLines(Employee $employee, $components, float $basic, float $gross): array
    {
        $assigned = $employee->payrollComponents->keyBy('id');
        $lines = [];

        foreach ($components as $i => $component) {
            $pivot = $assigned->get($component->id)?->pivot;

            // Not company-wide and not assigned to this employee — skip.
            if (! $component->applies_to_all && ! $pivot) {
                continue;
            }
            // Explicitly switched off for this employee.
            if ($pivot && ! $pivot->is_active) {
                continue;
            }

            $override = $pivot?->amount !== null ? (float) $pivot->amount : null;
            $amount = $component->resolve($basic, $gross, $override);

            if ($amount == 0.0) {
                continue; // a zero line is noise on the payslip
            }

            $lines[] = [
                'code' => $component->code,
                'name' => $component->name,
                'type' => $component->type,
                'amount' => $amount,
                'sort_order' => $component->sort_order ?: $i,
            ];
        }

        return $lines;
    }

    /** Approved, paid-type leave working days that fall inside the period. */
    private function paidLeaveDays(int $employeeId, Carbon $from, Carbon $to): float
    {
        $leaves = LeaveRequest::withoutGlobalScopes()->with('type:id,is_paid')
            ->where('employee_id', $employeeId)
            ->where('status', 'approved')
            ->where('date_from', '<=', $to)
            ->where('date_to', '>=', $from)
            ->get()
            ->filter(fn ($l) => $l->type?->is_paid);

        $days = 0.0;
        foreach ($leaves as $leave) {
            $start = $leave->date_from->max($from);
            $end = $leave->date_to->min($to);
            $days += LeaveRequest::workingDays($start, $end);
        }

        return $days;
    }

    /** Approved service-credit "use" days applied within the period. */
    private function serviceCreditDays(int $employeeId, Carbon $from, Carbon $to): float
    {
        return (float) ServiceCredit::withoutGlobalScopes()
            ->where('employee_id', $employeeId)
            ->where('entry_type', 'use')->where('status', 'approved')
            ->whereBetween('service_date', [$from->toDateString(), $to->toDateString()])
            ->sum('days');
    }
}
