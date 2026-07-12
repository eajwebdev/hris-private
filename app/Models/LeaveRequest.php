<?php

namespace App\Models;

use App\Models\Concerns\BelongsToBranch;
use App\Support\PrivateFile;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

class LeaveRequest extends Model
{
    use BelongsToBranch;

    protected $fillable = [
        'employee_id', 'branch_id', 'leave_type_id', 'date_from', 'date_to', 'half_day',
        'days', 'reason', 'attachment_path', 'attachment_name',
        'status', 'current_level', 'acted_by', 'acted_at', 'remarks',
    ];

    protected function casts(): array
    {
        return [
            'date_from' => 'date',
            'date_to' => 'date',
            'days' => 'decimal:1',
            'current_level' => 'integer',
            'acted_at' => 'datetime',
        ];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function type(): BelongsTo
    {
        return $this->belongsTo(LeaveType::class, 'leave_type_id');
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'acted_by');
    }

    public function approvals(): HasMany
    {
        return $this->hasMany(LeaveApproval::class)->orderBy('level');
    }

    /** The step the request is currently waiting on, if any. */
    public function currentApproval(): ?LeaveApproval
    {
        return $this->approvals->firstWhere('level', $this->current_level);
    }

    /** Usually a medical certificate — private disk, short-lived signed link. */
    public function attachmentUrl(): ?string
    {
        return PrivateFile::url($this->attachment_path);
    }

    /** Working days (Mon–Fri) in an inclusive range. */
    public static function workingDays(Carbon $from, Carbon $to): float
    {
        $days = 0;
        for ($d = $from->copy(); $d->lte($to); $d->addDay()) {
            if (! $d->isWeekend()) {
                $days++;
            }
        }

        return (float) $days;
    }

    /**
     * Days charged against the balance. A half-day is only ever a single date,
     * so it costs 0.5 regardless of which half is taken.
     */
    public static function chargeableDays(Carbon $from, Carbon $to, ?string $halfDay): float
    {
        $days = self::workingDays($from, $to);

        if ($halfDay && $from->isSameDay($to)) {
            return $days > 0 ? 0.5 : 0.0;
        }

        return $days;
    }
}
