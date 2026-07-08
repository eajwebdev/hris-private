<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

class JobOpening extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'company_id', 'branch_id', 'position_id', 'title', 'slug', 'department',
        'employment_type', 'location', 'salary_range', 'openings_count',
        'description', 'status', 'created_by', 'published_at',
    ];

    protected function casts(): array
    {
        return ['published_at' => 'datetime', 'openings_count' => 'integer'];
    }

    /** Default documents an applicant must attach — copied onto new openings, then editable. */
    public const DEFAULT_REQUIREMENTS = [
        ['name' => 'Resume / CV', 'description' => 'PDF or DOCX, max 5MB', 'is_required' => true],
        ['name' => 'Application Letter', 'description' => 'Cover letter addressed to HR', 'is_required' => true],
        ['name' => 'Valid Government ID', 'description' => 'Any government-issued ID', 'is_required' => true],
        ['name' => 'Transcript of Records', 'description' => 'For fresh graduates', 'is_required' => false],
    ];

    public function requirements(): HasMany
    {
        return $this->hasMany(JobOpeningRequirement::class)->orderBy('sort');
    }

    public function applications(): HasMany
    {
        return $this->hasMany(JobApplication::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** Unique, URL-safe slug from the title. */
    public static function uniqueSlug(string $title): string
    {
        $base = Str::slug($title) ?: 'job';
        $slug = $base;
        $i = 2;
        while (static::withTrashed()->where('slug', $slug)->exists()) {
            $slug = $base . '-' . $i++;
        }

        return $slug;
    }
}
