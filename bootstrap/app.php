<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'module' => \App\Http\Middleware\EnsureModuleAbility::class,
            'superadmin' => \App\Http\Middleware\EnsureSuperAdmin::class,
        ]);

        /*
         * The SPA authenticates with Sanctum's httpOnly *session cookie*, not a bearer
         * token in localStorage — a token in localStorage is readable by any script that
         * gets a foothold on the page, and it does not expire. This makes /api stateful
         * for same-origin SPA requests (session + CSRF); bearer tokens still work for
         * non-browser clients, which Sanctum falls back to automatically.
         */
        $middleware->statefulApi();

        // Laravel does not rate-limit API routes unless asked to. Without this, every
        // endpoint — including the unauthenticated careers upload — accepted unlimited
        // requests. Limiters are defined in AppServiceProvider::boot().
        $middleware->throttleApi('api');

        $middleware->api(append: [\App\Http\Middleware\SecurityHeaders::class]);
        $middleware->web(append: [\App\Http\Middleware\SecurityHeaders::class]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();
