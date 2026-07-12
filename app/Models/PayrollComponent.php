<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * A user-defined column on the payslip — an earning or a deduction.
 *
 * HR creates these; nothing in the codebase knows the names. The statutory ones
 * (SSS, PhilHealth, Pag-IBIG, tax) are just seeded rows flagged `is_statutory`.
 */
class PayrollComponent extends Model
{
    public const TYPES = ['earning' => 'Earning', 'deduction' => 'Deduction'];

    public const CALCS = [
        'fixed' => 'Fixed amount',
        'percent_basic' => '% of monthly basic',
        'percent_gross' => '% of period gross',
    ];

    protected $fillable = [
        'company_id', 'branch_id', 'code', 'name', 'type', 'calc', 'amount',
        'is_statutory', 'is_active', 'applies_to_all', 'is_taxable', 'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:4',
            'is_statutory' => 'boolean',
            'is_active' => 'boolean',
            'applies_to_all' => 'boolean',
            'is_taxable' => 'boolean',
            'sort_order' => 'integer',
        ];
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function employees(): BelongsToMany
    {
        return $this->belongsToMany(Employee::class, 'employee_payroll_components')
            ->withPivot('amount', 'is_active')->withTimestamps();
    }

    /**
     * Resolve this component to pesos for one employee.
     *
     * `$override` is the per-employee amount when set; percentages are read off
     * the monthly basic or the period's gross depending on `calc`.
     */
    public function resolve(float $basicSalary, float $gross, ?float $override = null): float
    {
        $amount = $override ?? (float) $this->amount;

        return round(match ($this->calc) {
            'percent_basic' => $basicSalary * $amount / 100,
            'percent_gross' => $gross * $amount / 100,
            default => $amount,
        }, 2);
    }
}
