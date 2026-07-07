<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class SettingController extends Controller
{
    /** Public branding + theme — loaded by the SPA on boot (no auth). */
    public function branding(): JsonResponse
    {
        return response()->json(Setting::branding());
    }

    /** Full settings for the admin editor. */
    public function index(): JsonResponse
    {
        $all = Setting::allValues();

        return response()->json([
            'system_name' => $all['system_name'] ?? 'EAJ HRIS',
            'system_tagline' => $all['system_tagline'] ?? 'Human Resources',
            'logo_url' => ! empty($all['logo_path']) ? asset('storage/' . $all['logo_path']) : null,
            'theme_mode' => $all['theme_mode'] ?? 'light',
            'theme_brand' => $all['theme_brand'] ?? '#2f6f5e',
            'theme_amber' => $all['theme_amber'] ?? '#e0a458',
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'system_name' => ['nullable', 'string', 'max:80'],
            'system_tagline' => ['nullable', 'string', 'max:120'],
            'theme_mode' => ['nullable', 'in:light,dark'],
            'theme_brand' => ['nullable', 'string', 'max:20'],
            'theme_amber' => ['nullable', 'string', 'max:20'],
            'logo' => ['nullable', 'image', 'max:2048'],
            'remove_logo' => ['nullable', 'boolean'],
        ]);

        $pairs = [];
        foreach (['system_name', 'system_tagline', 'theme_mode', 'theme_brand', 'theme_amber'] as $k) {
            if ($request->filled($k)) {
                $pairs[$k] = $data[$k];
            }
        }

        if ($request->hasFile('logo')) {
            $old = Setting::get('logo_path');
            if ($old) {
                Storage::disk('public')->delete($old);
            }
            $pairs['logo_path'] = $request->file('logo')->store('branding', 'public');
        } elseif ($request->boolean('remove_logo')) {
            $old = Setting::get('logo_path');
            if ($old) {
                Storage::disk('public')->delete($old);
            }
            $pairs['logo_path'] = '';
        }

        Setting::putMany($pairs);

        return response()->json(array_merge(['message' => 'Settings saved.'], Setting::branding()));
    }
}
