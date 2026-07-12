<?php

namespace App\Models;

use App\Support\PrivateFile;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EmployeeDocument extends Model
{
    protected $fillable = ['employee_id', 'name', 'category', 'path', 'mime', 'size'];

    protected $appends = ['url'];

    /** Short-lived signed link — these live on the private disk, not public/storage. */
    public function getUrlAttribute(): ?string
    {
        return PrivateFile::url($this->path);
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }
}
