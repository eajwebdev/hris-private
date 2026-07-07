<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Route guard: `->middleware('module:employees,create')`.
 * SuperAdmin bypasses via User::canModule().
 */
class EnsureModuleAbility
{
    public function handle(Request $request, Closure $next, string $module, string $ability = 'view'): Response
    {
        $user = $request->user();

        if (! $user || ! $user->canModule($module, $ability)) {
            abort(403, "You don't have permission to {$ability} {$module}.");
        }

        return $next($request);
    }
}
