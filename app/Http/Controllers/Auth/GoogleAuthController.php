<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Laravel\Socialite\Facades\Socialite;

/**
 * Google sign-in for the SPA (stateless OAuth → Sanctum token).
 *
 * Accounts are provisioned by HR — Google login only matches an EXISTING,
 * active user by email. Unknown emails are rejected, never auto-created.
 */
class GoogleAuthController extends Controller
{
    public function redirect(): RedirectResponse
    {
        abort_unless(config('services.google.client_id'), 404);

        return Socialite::driver('google')->stateless()->redirect();
    }

    public function callback(): RedirectResponse
    {
        abort_unless(config('services.google.client_id'), 404);

        try {
            $google = Socialite::driver('google')->stateless()->user();
        } catch (\Throwable) {
            return redirect('/login?error=' . urlencode('Google sign-in was cancelled or failed. Please try again.'));
        }

        $user = User::where('email', $google->getEmail())->first();

        if (! $user) {
            return redirect('/login?error=' . urlencode('No account matches this Google email. Ask HR to set up your access.'));
        }

        if (! $user->is_active) {
            return redirect('/login?error=' . urlencode('This account has been deactivated. Contact your HR administrator.'));
        }

        if (! $user->google_id) {
            $user->forceFill(['google_id' => $google->getId()])->save();
        }

        $token = $user->createToken('google-spa')->plainTextToken;

        // The SPA login page picks the token out of the URL and completes sign-in.
        return redirect('/login?token=' . urlencode($token));
    }
}
