<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One step in a leave request's approval chain. */
class LeaveApproval extends Model
{
    protected $fillable = [
        'leave_request_id', 'level', 'role', 'label',
        'approver_id', 'acted_by', 'status', 'remarks', 'acted_at',
    ];

    protected function casts(): array
    {
        return ['level' => 'integer', 'acted_at' => 'datetime'];
    }

    public function request(): BelongsTo
    {
        return $this->belongsTo(LeaveRequest::class, 'leave_request_id');
    }

    /** The named approver, when the step is tied to one person (a supervisor). */
    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approver_id');
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'acted_by');
    }
}
