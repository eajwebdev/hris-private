<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Laravel\Socialite\Facades\Socialite;

/**
 * Google sign-in for the SPA (stateless OAuth → httpOnly session cookie).
 *
 * Accounts are provisioned by HR — Google login only matches an EXISTING,
 * active user by email. Unknown emails are rejected, never auto-created.
 */
class GoogleAuthController extends Controller
{
    public function redirect(): RedirectResponse
    {
        // The button is always shown on the login page, so an unconfigured Google has to
        // land somewhere readable rather than on a bare 404.
        if (! $this->configured()) {
            return $this->fail('Google sign-in isn’t set up yet. Use your email and password for now.');
        }

        return Socialite::driver('google')->stateless()->redirect();
    }

    public function callback(Request $request): RedirectResponse
    {
        if (! $this->configured()) {
            return $this->fail('Google sign-in isn’t set up yet. Use your email and password for now.');
        }

        try {
            $google = Socialite::driver('google')->stateless()->user();
        } catch (\Throwable) {
            return $this->fail('Google sign-in was cancelled or failed. Please try again.');
        }

        $email = $google->getEmail();

        // Socialite hands back a profile with a null email if the scope was trimmed.
        // Matching on null would sign us in as whichever user happens to have no email.
        if (! $email) {
            return $this->fail('Google did not share an email address for this account.');
        }

        $user = User::where('email', $email)->first();

        if (! $user) {
            return $this->fail('No account matches this Google email. Ask HR to set up your access.');
        }

        if (! $user->is_active) {
            return $this->fail('This account has been deactivated. Contact your HR administrator.');
        }

        // Bind the Google identity on first use, then require it to keep matching.
        if (! $user->google_id) {
            $user->forceFill(['google_id' => $google->getId()])->save();
        } elseif (! hash_equals($user->google_id, (string) $google->getId())) {
            return $this->fail('This Google account is not linked to your HRIS user.');
        }

        /*
         * Sign the user straight into the session. This route is stateful, so there is no
         * credential to hand back to the browser at all — nothing goes in the URL, which
         * is what previously leaked a live bearer token into access logs and Referer headers.
         */
        Auth::guard('web')->login($user, remember: false);
        $request->session()->regenerate(); // session fixation

        return redirect('/login?oauth=1');
    }

    /** Both halves of the OAuth keypair must be present for the flow to work at all. */
    private function configured(): bool
    {
        return (bool) config('services.google.client_id')
            && (bool) config('services.google.client_secret');
    }

    private function fail(string $message): RedirectResponse
    {
        return redirect('/login?error=' . urlencode($message));
    }
}
