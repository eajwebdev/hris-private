<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Route guard: `->middleware('superadmin')`.
 *
 * For system-owner operations — setting a tenant's subscription plan/due date and
 * recording payment. Deliberately NOT a module ability: `module:billing,edit` can be
 * handed to a tenant user via a per-user override, and a tenant must never be able to
 * mark its own subscription invoice paid.
 */
class EnsureSuperAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user || ! $user->isSuperAdmin()) {
            abort(403, 'Only the system owner can manage subscription billing.');
        }

        return $next($request);
    }
}
