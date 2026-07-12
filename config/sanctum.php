<?php

use Illuminate\Cookie\Middleware\EncryptCookies;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Laravel\Sanctum\Http\Middleware\AuthenticateSession;
use Laravel\Sanctum\Sanctum;

return [

    /*
    |--------------------------------------------------------------------------
    | Stateful Domains
    |--------------------------------------------------------------------------
    |
    | Requests from the following domains / hosts will receive stateful API
    | authentication cookies. Typically, these should include your local
    | and production domains which access your API via a frontend SPA.
    |
    */

    /*
     * currentRequestHost() is enabled deliberately. The SPA is served by this same
     * Laravel app, so "the frontend" is always the request's own host — a *same-origin*
     * request. Matching on that is exact, whereas the static list matches host WITH port
     * and so silently fails to match whenever the app is not on the expected port
     * (dev on :8899, a container mapping, a staging box). When Sanctum decides a request
     * is not from the frontend it skips the session middleware entirely, and login then
     * dies with "Session store not set on request" — a 500, not a clear misconfiguration.
     *
     * This is not a weakening: a cross-site request carries a *different* Origin, so it
     * still never becomes stateful, and CSRF continues to guard the stateful writes.
     */
    /*
     * `?:` and not env()'s second argument: an env var that is PRESENT BUT EMPTY
     * (`SANCTUM_STATEFUL_DOMAINS=` — an easy thing to leave in a .env) makes env()
     * return '', not the default. That would explode() to an empty list, no request
     * would ever be stateful, and login would 500. Empty must mean "use the default".
     */
    'stateful' => explode(',', env('SANCTUM_STATEFUL_DOMAINS') ?: sprintf(
        '%s,%s,%s',
        'localhost,localhost:3000,127.0.0.1,127.0.0.1:8000,::1',
        Sanctum::currentApplicationUrlWithPort(),
        Sanctum::currentRequestHost(),
    )),

    /*
    |--------------------------------------------------------------------------
    | Sanctum Guards
    |--------------------------------------------------------------------------
    |
    | This array contains the authentication guards that will be checked when
    | Sanctum is trying to authenticate a request. If none of these guards
    | are able to authenticate the request, Sanctum will use the bearer
    | token that's present on an incoming request for authentication.
    |
    */

    'guard' => ['web'],

    /*
    |--------------------------------------------------------------------------
    | Expiration Minutes
    |--------------------------------------------------------------------------
    |
    | This value controls the number of minutes until an issued token will be
    | considered expired. This will override any values set in the token's
    | "expires_at" attribute, but first-party sessions are not affected.
    |
    */

    'expiration' => null,

    /*
    |--------------------------------------------------------------------------
    | Token Prefix
    |--------------------------------------------------------------------------
    |
    | Sanctum can prefix new tokens in order to take advantage of numerous
    | security scanning initiatives maintained by open source platforms
    | that notify developers if they commit tokens into repositories.
    |
    | See: https://docs.github.com/en/code-security/secret-scanning/about-secret-scanning
    |
    */

    'token_prefix' => env('SANCTUM_TOKEN_PREFIX', ''),

    /*
    |--------------------------------------------------------------------------
    | Sanctum Middleware
    |--------------------------------------------------------------------------
    |
    | When authenticating your first-party SPA with Sanctum you may need to
    | customize some of the middleware Sanctum uses while processing the
    | request. You may change the middleware listed below as required.
    |
    */

    'middleware' => [
        'authenticate_session' => AuthenticateSession::class,
        'encrypt_cookies' => EncryptCookies::class,
        'validate_csrf_token' => ValidateCsrfToken::class,
    ],

];
