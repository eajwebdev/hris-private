<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use Spatie\Permission\Traits\HasRoles;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, HasRoles, Notifiable, SoftDeletes;

    protected $fillable = [
        'name',
        'username',
        'email',
        'password',
        'company_id',
        'is_super_admin',
        'preset',
        'avatar_path',
        'is_active',
        'google_id',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_super_admin' => 'boolean',
            'is_active' => 'boolean',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function employee(): HasOne
    {
        return $this->hasOne(Employee::class);
    }

    /** Branches this user is scoped to (many-to-many). */
    public function branches(): BelongsToMany
    {
        return $this->belongsToMany(Branch::class, 'branch_user');
    }

    /** Per-user module ability overrides layered on top of the preset. */
    public function modulePermissions(): HasMany
    {
        return $this->hasMany(UserModulePermission::class);
    }

    public function isSuperAdmin(): bool
    {
        return (bool) $this->is_super_admin;
    }

    /** IDs of branches this user may touch (SuperAdmin => all). */
    public function accessibleBranchIds(): array
    {
        if ($this->isSuperAdmin()) {
            return Branch::query()->pluck('id')->all();
        }

        return $this->branches()->pluck('branches.id')->all();
    }

    /**
     * Does the user have an ability on a module? SuperAdmin bypasses all checks.
     * Resolves the *effective* permission (preset defaults + per-user overrides),
     * the same source the API exposes to the frontend, so guard and UI agree.
     */
    public function canModule(string $module, string $ability = 'view'): bool
    {
        if ($this->isSuperAdmin()) {
            return true;
        }

        return (bool) (\App\Support\Permissions::effective($this)[$module][$ability] ?? false);
    }
}
