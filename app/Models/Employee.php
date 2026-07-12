<?php

namespace App\Models;

use App\Models\Concerns\BelongsToBranch;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Employee extends Model
{
    use BelongsToBranch, SoftDeletes;

    protected $fillable = [
        'branch_id', 'company_id', 'user_id', 'department_id', 'position_id', 'manager_id',
        'employee_no', 'first_name', 'middle_name', 'last_name', 'photo_path', 'email', 'phone',
        'birth_date', 'gender', 'civil_status', 'address',
        'employment_type', 'status', 'date_hired', 'date_regularized', 'date_ended', 'basic_salary',
        'tin', 'sss', 'philhealth', 'pagibig', 'bank_name', 'bank_account', 'work_schedule_id',
    ];

    protected function casts(): array
    {
        return [
            'birth_date' => 'date',
            'date_hired' => 'date',
            'date_regularized' => 'date',
            'date_ended' => 'date',
            'basic_salary' => 'decimal:2',
        ];
    }

    protected $appends = ['full_name'];

    public function getFullNameAttribute(): string
    {
        return trim("{$this->first_name} {$this->last_name}");
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    public function position(): BelongsTo
    {
        return $this->belongsTo(Position::class);
    }

    public function manager(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'manager_id');
    }

    public function reports(): HasMany
    {
        return $this->hasMany(Employee::class, 'manager_id');
    }

    public function dependents(): HasMany
    {
        return $this->hasMany(EmployeeDependent::class);
    }

    public function emergencyContacts(): HasMany
    {
        return $this->hasMany(EmergencyContact::class);
    }

    public function histories(): HasMany
    {
        return $this->hasMany(EmployeeHistory::class);
    }

    public function documents(): HasMany
    {
        return $this->hasMany(EmployeeDocument::class);
    }

    /** Salary components explicitly assigned to (or overridden for) this employee. */
    public function payrollComponents(): BelongsToMany
    {
        return $this->belongsToMany(PayrollComponent::class, 'employee_payroll_components')
            ->withPivot('amount', 'is_active')->withTimestamps();
    }
}
