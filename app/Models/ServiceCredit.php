<?php

namespace App\Models;

use App\Models\Concerns\BelongsToBranch;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ServiceCredit extends Model
{
    use BelongsToBranch;

    protected $fillable = [
        'employee_id', 'branch_id', 'entry_type', 'days', 'service_date',
        'reason', 'status', 'source', 'acted_by', 'acted_at', 'remarks',
    ];

    protected function casts(): array
    {
        return [
            'days' => 'decimal:1',
            'service_date' => 'date',
            'acted_at' => 'datetime',
        ];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'acted_by');
    }

    /** Running balance = approved earns − approved uses. */
    public static function balanceFor(int $employeeId): float
    {
        $sum = static::withoutGlobalScopes()
            ->where('employee_id', $employeeId)
            ->where('status', 'approved')
            ->selectRaw("coalesce(sum(case when entry_type = 'earn' then days else -days end), 0) as bal")
            ->value('bal');

        return (float) $sum;
    }

    /** Approved earns credited this calendar year (for the annual cap). */
    public static function earnedThisYear(int $employeeId): float
    {
        return (float) static::withoutGlobalScopes()
            ->where('employee_id', $employeeId)
            ->where('entry_type', 'earn')->where('status', 'approved')
            ->whereYear('service_date', now()->year)
            ->sum('days');
    }
}
