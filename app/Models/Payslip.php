<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Payslip extends Model
{
    protected $fillable = [
        'payroll_period_id', 'employee_id', 'branch_id',
        'basic_salary', 'daily_rate', 'days_present', 'paid_leave_days', 'service_credit_days',
        'late_minutes', 'undertime_minutes', 'early_out_minutes',
        'gross_pay', 'total_earnings', 'late_deduction', 'total_deductions', 'net_pay',
    ];

    protected function casts(): array
    {
        return [
            'basic_salary' => 'decimal:2',
            'daily_rate' => 'decimal:2',
            'days_present' => 'decimal:1',
            'paid_leave_days' => 'decimal:1',
            'service_credit_days' => 'decimal:1',
            'gross_pay' => 'decimal:2',
            'total_earnings' => 'decimal:2',
            'late_deduction' => 'decimal:2',
            'total_deductions' => 'decimal:2',
            'net_pay' => 'decimal:2',
        ];
    }

    public function lines(): HasMany
    {
        return $this->hasMany(PayslipLine::class)->orderBy('sort_order');
    }

    public function earnings(): HasMany
    {
        return $this->lines()->where('type', 'earning');
    }

    public function deductions(): HasMany
    {
        return $this->lines()->where('type', 'deduction');
    }

    public function period(): BelongsTo
    {
        return $this->belongsTo(PayrollPeriod::class, 'payroll_period_id');
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }
}
