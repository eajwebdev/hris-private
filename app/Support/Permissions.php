<?php

namespace App\Support;

use App\Models\User;

/**
 * Resolves a user's *effective* module permissions: start from their preset's
 * defaults, then layer the per-user overrides (user_module_permissions) on top.
 * SuperAdmin implicitly has every ability on every module.
 */
class Permissions
{
    public static function modules(): array
    {
        return config('hris.modules');
    }

    public static function abilities(): array
    {
        return config('hris.abilities');
    }

    /** @return array<string, array<string, bool>> module => {ability: bool} */
    public static function effective(User $user): array
    {
        $modules = config('hris.modules');
        $result = [];

        foreach ($modules as $key => $def) {
            $abilities = [];
            foreach ($def['abilities'] as $ability) {
                $abilities[$ability] = $user->isSuperAdmin();
            }
            $result[$key] = $abilities;
        }

        if ($user->isSuperAdmin()) {
            return $result;
        }

        // Preset defaults.
        $preset = config('hris.presets.' . $user->preset);
        if ($preset && ! empty($preset['modules'])) {
            foreach ($preset['modules'] as $module => $grant) {
                if (! isset($result[$module])) {
                    continue;
                }
                $granted = $grant === '*' ? array_keys($result[$module]) : (array) $grant;
                foreach ($granted as $ability) {
                    if (array_key_exists($ability, $result[$module])) {
                        $result[$module][$ability] = true;
                    }
                }
            }
        }

        // Per-user overrides (win over preset).
        foreach ($user->modulePermissions as $perm) {
            if (! isset($result[$perm->module])) {
                continue;
            }
            foreach ((array) $perm->abilities as $ability => $value) {
                if (array_key_exists($ability, $result[$perm->module])) {
                    $result[$perm->module][$ability] = (bool) $value;
                }
            }
        }

        return $result;
    }
}
