<?php

namespace App\Models\Scopes;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Scope;
use Illuminate\Support\Facades\Auth;

/**
 * Restricts queries to the authenticated user's accessible branches.
 * No auth context (console, public routes) => scope is a no-op so seeders
 * and the public careers portal still work. SuperAdmin bypasses scoping.
 */
class BranchScope implements Scope
{
    public function apply(Builder $builder, Model $model): void
    {
        $user = Auth::user();

        if (! $user || $user->isSuperAdmin()) {
            return;
        }

        $builder->whereIn($model->getTable() . '.branch_id', $user->accessibleBranchIds() ?: [0]);
    }
}
