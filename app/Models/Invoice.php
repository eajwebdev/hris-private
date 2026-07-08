<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Invoice extends Model
{
    protected $fillable = [
        'company_id', 'number', 'description', 'period_label',
        'amount', 'currency', 'status', 'issued_at', 'due_at', 'paid_at',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'issued_at' => 'date',
            'due_at' => 'date',
            'paid_at' => 'datetime',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    /** Sequential, human-friendly invoice number: INV-2026-0007. */
    public static function nextNumber(int $companyId): string
    {
        $count = static::where('company_id', $companyId)->count() + 1;

        return 'INV-' . now()->year . '-' . str_pad((string) $count, 4, '0', STR_PAD_LEFT);
    }
}
