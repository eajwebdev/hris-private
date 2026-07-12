<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\TransientToken;

class AuthController extends Controller
{
    /** Failed sign-in attempts allowed before the caller is locked out. */
    private const MAX_ATTEMPTS = 5;

    private const DECAY_SECONDS = 60;

    /** Token-based login for the SPA (Sanctum personal access token). */
    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            // `login` accepts an email address or a username ("email" kept for backward-compat).
            'login' => ['required_without:email', 'string'],
            'email' => ['required_without:login', 'string'],
            'password' => ['required', 'string'],
            'device_name' => ['nullable', 'string'],
        ]);

        $identifier = $data['login'] ?? $data['email'];

        // Throttle on the identifier *and* the IP: the first stops an attacker
        // grinding one account, the second stops them spraying many.
        $keys = [
            'login:' . Str::lower($identifier) . '|' . $request->ip(),
            'login-ip:' . $request->ip(),
        ];

        foreach ($keys as $key) {
            if (RateLimiter::tooManyAttempts($key, self::MAX_ATTEMPTS)) {
                throw ValidationException::withMessages([
                    'email' => ['Too many sign-in attempts. Try again in '
                        . RateLimiter::availableIn($key) . ' seconds.'],
                ])->status(429);
            }
        }

        $user = User::where('email', $identifier)
            ->orWhere('username', $identifier)
            ->first();

        if (! $user || ! Hash::check($data['password'], $user->password)) {
            foreach ($keys as $key) {
                RateLimiter::hit($key, self::DECAY_SECONDS);
            }

            throw ValidationException::withMessages([
                'email' => ['These credentials don\'t match our records.'],
            ]);
        }

        if (! $user->is_active) {
            throw ValidationException::withMessages([
                'email' => ['This account has been deactivated. Contact your HR administrator.'],
            ]);
        }

        // Only a genuine sign-in clears the counters.
        foreach ($keys as $key) {
            RateLimiter::clear($key);
        }

        /*
         * Establish an httpOnly session cookie rather than returning a bearer token.
         * The SPA used to keep the token in localStorage, where any injected script could
         * read it and use it forever. A session cookie is unreadable from JavaScript, is
         * bound to this browser, and dies on logout.
         *
         * regenerate() rotates the session id so a pre-existing (possibly attacker-planted)
         * id cannot be reused after the privilege change — session fixation.
         */
        Auth::guard('web')->login($user, remember: false);
        $request->session()->regenerate();

        $user->load(['branches', 'modulePermissions', 'employee']);

        return response()->json([
            'user' => new UserResource($user),
        ]);
    }

    public function me(Request $request): UserResource
    {
        $user = $request->user()->load(['branches', 'modulePermissions', 'employee']);

        return new UserResource($user);
    }

    public function logout(Request $request): JsonResponse
    {
        // Token clients (non-browser) still authenticate with a bearer token — revoke it.
        $token = $request->user()?->currentAccessToken();
        if ($token && ! $token instanceof TransientToken) {
            $token->delete();
        }

        Auth::guard('web')->logout();

        // Kill the old session outright and issue a fresh CSRF token, so neither the
        // session id nor the CSRF token survives the sign-out.
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['message' => 'Signed out.']);
    }
}
