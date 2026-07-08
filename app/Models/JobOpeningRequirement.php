<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class JobOpeningRequirement extends Model
{
    protected $fillable = ['job_opening_id', 'name', 'description', 'is_required', 'sort'];

    protected function casts(): array
    {
        return ['is_required' => 'boolean', 'sort' => 'integer'];
    }

    public function opening(): BelongsTo
    {
        return $this->belongsTo(JobOpening::class, 'job_opening_id');
    }
}
