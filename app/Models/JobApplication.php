<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class JobApplication extends Model
{
    protected $fillable = [
        'job_opening_id', 'first_name', 'last_name', 'email', 'phone',
        'cover_letter', 'status', 'rating', 'hr_notes', 'reviewed_by', 'reviewed_at', 'employee_id',
    ];

    protected function casts(): array
    {
        return ['reviewed_at' => 'datetime', 'rating' => 'integer'];
    }

    public const STATUSES = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected', 'withdrawn'];

    public function opening(): BelongsTo
    {
        return $this->belongsTo(JobOpening::class, 'job_opening_id');
    }

    public function documents(): HasMany
    {
        return $this->hasMany(JobApplicationDocument::class);
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    /** Set once the applicant has been converted into a 201 record. */
    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function getFullNameAttribute(): string
    {
        return trim("{$this->first_name} {$this->last_name}");
    }
}
