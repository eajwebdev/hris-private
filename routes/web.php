<?php

use Illuminate\Support\Facades\Route;

// Serve the React SPA for every non-API path. Client-side routing takes over.
Route::get('/{any?}', fn () => view('app'))->where('any', '^(?!api).*$');
