<?php

use App\Http\Controllers\Auth\GoogleAuthController;
use Illuminate\Support\Facades\Route;

// Google OAuth (stateless) — issues a Sanctum token and bounces back to the SPA.
Route::get('/auth/google/redirect', [GoogleAuthController::class, 'redirect']);
Route::get('/auth/google/callback', [GoogleAuthController::class, 'callback']);

// Serve the React SPA for every non-API path. Client-side routing takes over.
Route::get('/{any?}', fn () => view('app'))->where('any', '^(?!api|auth).*$');
