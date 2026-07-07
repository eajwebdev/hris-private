<?php

namespace App\Models;

use App\Models\Concerns\BelongsToBranch;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Position extends Model
{
    use BelongsToBranch, SoftDeletes;

    protected $fillable = ['branch_id', 'department_id', 'title'];

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }
}
