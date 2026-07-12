<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Baseline response headers. The bearer token lives in localStorage, so any script
 * injection on our own origin reads it — these headers shrink that blast radius.
 */
class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        // Never let a browser second-guess a declared content type. Together with the
        // forced `attachment` disposition in FileController, this stops an uploaded
        // file from being interpreted as HTML or script on our origin.
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('X-Frame-Options', 'DENY');
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->headers->set('Permissions-Policy', 'geolocation=(self), camera=(self), microphone=()');

        // HSTS only over TLS — sending it on plain HTTP is meaningless, and in local
        // dev it would pin the browser to https://localhost.
        if ($request->secure()) {
            $response->headers->set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }

        return $response;
    }
}
