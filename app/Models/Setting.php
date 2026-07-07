<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;

class Setting extends Model
{
    protected $fillable = ['key', 'value'];

    public $timestamps = true;

    private const CACHE_KEY = 'settings.all';

    /** All settings as an associative array (cached). */
    public static function allValues(): array
    {
        return Cache::rememberForever(self::CACHE_KEY, fn () => self::pluck('value', 'key')->toArray());
    }

    public static function get(string $key, $default = null)
    {
        return self::allValues()[$key] ?? $default;
    }

    public static function put(string $key, $value): void
    {
        self::updateOrCreate(['key' => $key], ['value' => $value]);
        Cache::forget(self::CACHE_KEY);
    }

    public static function putMany(array $pairs): void
    {
        foreach ($pairs as $key => $value) {
            self::updateOrCreate(['key' => $key], ['value' => $value]);
        }
        Cache::forget(self::CACHE_KEY);
    }

    /** Public branding + theme payload consumed by the SPA on boot. */
    public static function branding(): array
    {
        $all = self::allValues();
        $logo = $all['logo_path'] ?? null;

        return [
            'system_name' => $all['system_name'] ?? 'EAJ HRIS',
            'system_tagline' => $all['system_tagline'] ?? 'Human Resources',
            'logo_url' => $logo ? asset('storage/' . $logo) : null,
            'mode' => $all['theme_mode'] ?? 'light',
            'vars' => [
                'brand' => $all['theme_brand'] ?? null,
                'amber' => $all['theme_amber'] ?? null,
            ],
        ];
    }
}
