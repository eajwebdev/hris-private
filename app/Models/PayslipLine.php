<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A resolved component on a generated payslip — a snapshot, never recomputed. */
class PayslipLine extends Model
{
    protected $fillable = ['payslip_id', 'code', 'name', 'type', 'amount', 'sort_order'];

    protected function casts(): array
    {
        return ['amount' => 'decimal:2', 'sort_order' => 'integer'];
    }

    public function payslip(): BelongsTo
    {
        return $this->belongsTo(Payslip::class);
    }
}
