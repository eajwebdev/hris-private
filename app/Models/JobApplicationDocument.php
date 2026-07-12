<?php

namespace App\Models;

use App\Support\PrivateFile;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class JobApplicationDocument extends Model
{
    protected $fillable = ['job_application_id', 'job_opening_requirement_id', 'label', 'file_path', 'original_name'];

    public function application(): BelongsTo
    {
        return $this->belongsTo(JobApplication::class, 'job_application_id');
    }

    /** Applicant CVs and IDs — private disk, handed out as a short-lived signed link. */
    public function getUrlAttribute(): ?string
    {
        return PrivateFile::url($this->file_path);
    }
}
