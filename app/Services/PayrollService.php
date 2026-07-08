<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\LeaveRequest;
use App\Models\PayrollPeriod;
use App\Models\Payslip;
use App\Models\ServiceCredit;
use App\Models\Setting;
use Illuminate\Support\Carbon;

/**
 * Basic payroll computation from attendance + approved paid leave.
 *
 *   daily rate   = monthly basic ÷ working-days-per-month (setting, default 22)
 *   per-minute   = daily ÷ 8h ÷ 60
 *   gross        = daily × (days present + paid leave days in period)
 *   late deduct  = (late + undertime + early-out minutes) × per-minute
 *   net          = gross − late deduction
 */
class PayrollService
{
    /** (Re)generate all payslips for a draft period. */
    public function generate(PayrollPeriod $period): PayrollPeriod
    {
        $divisor = max(1, (int) Setting::get('payroll_working_days', 22));

        $employees = Employee::withoutGlobalScopes()
            ->whereIn('status', ['regular', 'probationary'])
            ->when($period->branch_id, fn ($q) => $q->where('branch_id', $period->branch_id))
            ->whereHas('branch', fn ($q) => $q->where('company_id', $period->company_id))
            ->get();

        $from = $period->period_start->toDateString();
        $to = $period->period_end->toDateString();

        $period->payslips()->delete();

        foreach ($employees as $employee) {
            $rows = Attendance::withoutGlobalScopes()
                ->where('employee_id', $employee->id)
                ->whereBetween('work_date', [$from, $to])
                ->get();

            $paidLeaveDays = $this->paidLeaveDays($employee->id, $period->period_start, $period->period_end);
            $serviceCreditDays = $this->serviceCreditDays($employee->id, $period->period_start, $period->period_end);

            $daily = round((float) $employee->basic_salary / $divisor, 2);
            $perMinute = $daily / 8 / 60;

            $daysPresent = (float) $rows->count();
            $lateMinutes = (int) $rows->sum(fn ($a) => $a->late_am_minutes + $a->late_pm_minutes);
            $undertime = (int) $rows->sum('undertime_minutes');
            $earlyOut = (int) $rows->sum('early_out_minutes');

            $gross = round($daily * ($daysPresent + $paidLeaveDays + $serviceCreditDays), 2);
            $lateDeduction = round(($lateMinutes + $undertime + $earlyOut) * $perMinute, 2);

            Payslip::create([
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
                'late_deduction' => $lateDeduction,
                'net_pay' => round(max(0, $gross - $lateDeduction), 2),
            ]);
        }

        return $period->fresh('payslips');
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
