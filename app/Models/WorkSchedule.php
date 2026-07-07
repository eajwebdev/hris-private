<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WorkSchedule extends Model
{
    protected $fillable = [
        'branch_id', 'name', 'morning_in', 'morning_out', 'afternoon_in', 'afternoon_out',
        'grace_minutes', 'is_default',
    ];

    protected function casts(): array
    {
        return ['is_default' => 'boolean', 'grace_minutes' => 'integer'];
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    /** The schedule that applies to an employee: their own, else branch default, else global default. */
    public static function forEmployee(Employee $employee): ?self
    {
        if ($employee->work_schedule_id) {
            return self::find($employee->work_schedule_id);
        }

        return self::where('branch_id', $employee->branch_id)->where('is_default', true)->first()
            ?? self::where('is_default', true)->first()
            ?? self::first();
    }
}
