<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Subscription reminders: one pass each morning. The command is idempotent (one
// billing notification per user per day), so a missed or double run is harmless.
Schedule::command('billing:remind')->dailyAt('08:00')->withoutOverlapping();
