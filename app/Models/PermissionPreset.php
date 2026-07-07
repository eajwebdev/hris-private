<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PermissionPreset extends Model
{
    protected $fillable = ['company_id', 'key', 'label', 'grants_all', 'modules', 'is_system'];

    protected function casts(): array
    {
        return [
            'grants_all' => 'boolean',
            'is_system' => 'boolean',
            'modules' => 'array',
        ];
    }
}
