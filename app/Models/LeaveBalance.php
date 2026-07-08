<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LeaveBalance extends Model
{
    protected $fillable = ['employee_id', 'leave_type_id', 'year', 'allocated', 'used'];

    protected function casts(): array
    {
        return ['allocated' => 'decimal:1', 'used' => 'decimal:1', 'year' => 'integer'];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function type(): BelongsTo
    {
        return $this->belongsTo(LeaveType::class, 'leave_type_id');
    }

    /** Find-or-create this year's balance seeded with the type's default allocation. */
    public static function current(int $employeeId, LeaveType $type): self
    {
        return self::firstOrCreate(
            ['employee_id' => $employeeId, 'leave_type_id' => $type->id, 'year' => now()->year],
            ['allocated' => $type->default_days, 'used' => 0],
        );
    }

    public function getRemainingAttribute(): float
    {
        return (float) $this->allocated - (float) $this->used;
    }
}
