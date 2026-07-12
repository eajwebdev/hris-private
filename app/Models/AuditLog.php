<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AuditLog extends Model
{
    /** Append-only — the row is written once and never touched again. */
    public const UPDATED_AT = null;

    protected $fillable = [
        'company_id', 'branch_id', 'user_id', 'user_name', 'module', 'action',
        'subject_type', 'subject_id', 'subject_label', 'description', 'changes', 'ip', 'user_agent',
    ];

    protected function casts(): array
    {
        return [
            'changes' => 'array',
            'created_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }
}
