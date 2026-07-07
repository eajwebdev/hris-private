<?php

use App\Http\Controllers\Api\AttendanceController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\EmployeeController;
use App\Http\Controllers\Api\EmployeeDocumentController;
use App\Http\Controllers\Api\EventController;
use App\Http\Controllers\Api\LookupController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\SettingController;
use App\Support\Permissions;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API v1
|--------------------------------------------------------------------------
| Routes are grouped by module. Every write route is guarded by both the
| `module:<name>,<ability>` middleware and (via model global scope) branch
| access. SuperAdmin bypasses both.
*/

Route::prefix('v1')->group(function () {
    // --- Public ---------------------------------------------------------
    Route::post('login', [AuthController::class, 'login']);

    // Module + ability registry so the UI can render permission checklists.
    Route::get('meta/modules', fn () => [
        'modules' => Permissions::modules(),
        'abilities' => Permissions::abilities(),
        'presets' => config('hris.presets'),
    ]);

    // Public branding + theme (system name, logo) — loaded by the SPA on boot.
    Route::get('meta/branding', [SettingController::class, 'branding']);

    // --- Authenticated --------------------------------------------------
    Route::middleware('auth:sanctum')->group(function () {
        Route::get('me', [AuthController::class, 'me']);
        Route::post('logout', [AuthController::class, 'logout']);

        // Lookups (any authenticated user — used by forms).
        Route::get('lookups/branches', [LookupController::class, 'branches']);
        Route::get('lookups/departments', [LookupController::class, 'departments']);
        Route::get('lookups/positions', [LookupController::class, 'positions']);
        Route::get('lookups/managers', [LookupController::class, 'managers']);

        // --- Employees (201 file) ---------------------------------------
        Route::get('employees/org-chart', [EmployeeController::class, 'orgChart'])->middleware('module:employees,view');
        Route::get('employees', [EmployeeController::class, 'index'])->middleware('module:employees,view');
        Route::get('employees/{employee}', [EmployeeController::class, 'show'])->middleware('module:employees,view');
        Route::post('employees', [EmployeeController::class, 'store'])->middleware('module:employees,create');
        Route::post('employees/{employee}', [EmployeeController::class, 'update'])->middleware('module:employees,edit'); // POST for multipart
        Route::put('employees/{employee}', [EmployeeController::class, 'update'])->middleware('module:employees,edit');
        Route::delete('employees/{employee}', [EmployeeController::class, 'destroy'])->middleware('module:employees,delete');
        Route::post('employees/{employee}/account', [EmployeeController::class, 'provisionAccount'])->middleware('module:employees,create');
        Route::post('employees/{employee}/documents', [EmployeeDocumentController::class, 'store'])->middleware('module:employees,edit');
        Route::delete('employees/{employee}/documents/{document}', [EmployeeDocumentController::class, 'destroy'])->middleware('module:employees,edit');

        // --- Attendance -------------------------------------------------
        // ESS punch endpoints — available to any employee (own record only).
        Route::get('attendance/today', [AttendanceController::class, 'today']);
        Route::post('attendance/punch', [AttendanceController::class, 'punch']);
        // HR views — gated by module permission.
        Route::get('attendance/monitor', [AttendanceController::class, 'monitor'])->middleware('module:attendance,view');
        Route::get('attendance', [AttendanceController::class, 'index'])->middleware('module:attendance,view');
        Route::get('attendance/{attendance}', [AttendanceController::class, 'show'])->middleware('module:attendance,view');
        Route::post('attendance/{attendance}/correct', [AttendanceController::class, 'correct'])->middleware('module:attendance,edit');

        // --- Dashboards -------------------------------------------------
        Route::get('dashboard/admin', [DashboardController::class, 'adminSummary']);
        Route::get('dashboard/ess', [DashboardController::class, 'essSummary']);

        // --- Notifications (any authenticated user) ---------------------
        Route::get('notifications', [NotificationController::class, 'index']);
        Route::post('notifications/read-all', [NotificationController::class, 'markAll']);
        Route::post('notifications/{notification}/read', [NotificationController::class, 'markRead']);

        // --- Events -----------------------------------------------------
        Route::get('events/feed', [EventController::class, 'feed']); // employee view-only
        Route::get('events', [EventController::class, 'index'])->middleware('module:events,view');
        Route::post('events', [EventController::class, 'store'])->middleware('module:events,create');
        Route::put('events/{event}', [EventController::class, 'update'])->middleware('module:events,edit');
        Route::delete('events/{event}', [EventController::class, 'destroy'])->middleware('module:events,delete');

        // --- System settings (SuperAdmin / settings module) -------------
        Route::get('settings', [SettingController::class, 'index'])->middleware('module:settings,view');
        Route::post('settings', [SettingController::class, 'update'])->middleware('module:settings,edit');
    });
});
