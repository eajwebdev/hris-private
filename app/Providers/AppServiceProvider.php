<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->configureRateLimiting();
        $this->guardAgainstDebugInProduction();
    }

    /**
     * Rate limits for the API. Signed-in users are keyed by user id so one noisy
     * client can't exhaust an allowance shared across everyone behind a NAT; guests
     * fall back to IP.
     */
    private function configureRateLimiting(): void
    {
        RateLimiter::for('api', fn (Request $request) => Limit::perMinute(120)
            ->by($request->user()?->id ?: $request->ip()));

        // Unauthenticated and it writes rows + accepts file uploads, so it is the
        // cheapest thing on the system to abuse. Deliberately tight.
        RateLimiter::for('careers', fn (Request $request) => [
            Limit::perMinute(5)->by($request->ip()),
            Limit::perDay(20)->by($request->ip()),
        ]);

        // Backstop for credential stuffing. AuthController also throttles per-identifier,
        // which this does not replace — this caps the spraying, that caps the grinding.
        RateLimiter::for('login', fn (Request $request) => Limit::perMinute(10)->by($request->ip()));
    }

    /**
     * APP_DEBUG=true in production dumps stack traces, file paths, and fragments of
     * SQL (with bound values) straight to the browser on any unhandled error. It is a
     * one-character mistake in a .env file, so fail loudly rather than leak quietly.
     */
    private function guardAgainstDebugInProduction(): void
    {
        if ($this->app->environment('production') && config('app.debug')) {
            Log::critical('APP_DEBUG is enabled in production — stack traces are being exposed. Set APP_DEBUG=false.');
        }
    }
}
