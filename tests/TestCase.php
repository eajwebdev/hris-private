<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use RuntimeException;

abstract class TestCase extends BaseTestCase
{
    /**
     * Refuse to run against anything but the throwaway in-memory database.
     *
     * phpunit.xml pins DB_CONNECTION=sqlite / :memory:, but a *cached config*
     * (bootstrap/cache/config.php) silently overrides it: cached config is loaded
     * verbatim and the env() calls inside config/*.php are never re-evaluated, so the
     * suite quietly picks up the real MySQL credentials instead. RefreshDatabase then
     * runs migrate:fresh — and drops every table in the development database.
     *
     * That is not a hypothetical; it happened. Fail loudly instead.
     */
    protected function setUpTraits()
    {
        // Deliberately setUpTraits() and not setUp(): setUp() calls this, and THIS is what
        // boots RefreshDatabase (i.e. runs migrate:fresh). A check placed after
        // parent::setUp() would fire only once the tables had already been dropped —
        // which is exactly the accident it is meant to prevent.
        $this->guardTestDatabase();

        return parent::setUpTraits();
    }

    private function guardTestDatabase(): void
    {
        $connection = config('database.default');
        $database = config("database.connections.{$connection}.database");

        if ($connection !== 'sqlite' || $database !== ':memory:') {
            throw new RuntimeException(
                "Refusing to run tests against '{$connection}' ({$database}). The suite must use "
                . "sqlite/:memory:. You almost certainly have a stale config cache — run "
                . '`php artisan config:clear` and try again.'
            );
        }
    }
}
