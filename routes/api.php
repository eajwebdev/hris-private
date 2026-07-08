<?php

use App\Http\Controllers\Api\AnnouncementController;
use App\Http\Controllers\Api\AttendanceController;
use App\Http\Controllers\Api\BillingController;
use App\Http\Controllers\Api\BranchController;
use App\Http\Controllers\Api\CareersController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\EmployeeController;
use App\Http\Controllers\Api\EmployeeDocumentController;
use App\Http\Controllers\Api\EventController;
use App\Http\Controllers\Api\LeaveController;
use App\Http\Controllers\Api\LookupController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\PayrollController;
use App\Http\Controllers\Api\RecruitmentController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\ServiceCreditController;
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

    // Public careers portal (no auth) — browse + apply.
    Route::get('careers', [CareersController::class, 'index']);
    Route::get('careers/{slug}', [CareersController::class, 'show']);
    Route::post('careers/{slug}/apply', [CareersController::class, 'apply']);

    // --- Authenticated --------------------------------------------------
    Route::middleware('auth:sanctum')->group(function () {
        Route::get('me', [AuthController::class, 'me']);
        Route::post('logout', [AuthController::class, 'logout']);

        // Lookups (any authenticated user — used by forms).
        Route::get('lookups/branches', [LookupController::class, 'branches']);
        Route::get('lookups/departments', [LookupController::class, 'departments']);
        Route::get('lookups/positions', [LookupController::class, 'positions']);
        Route::get('lookups/managers', [LookupController::class, 'managers']);
        Route::get('lookups/employees', [LookupController::class, 'employees']);

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

        // --- Branches + work schedules -----------------------------------
        Route::get('branches', [BranchController::class, 'index'])->middleware('module:branches,view');
        Route::post('branches', [BranchController::class, 'store'])->middleware('module:branches,create');
        Route::put('branches/{branch}', [BranchController::class, 'update'])->middleware('module:branches,edit');
        Route::delete('branches/{branch}', [BranchController::class, 'destroy'])->middleware('module:branches,delete');
        Route::post('branches/{branch}/schedules', [BranchController::class, 'saveSchedule'])->middleware('module:branches,edit');
        Route::delete('branches/{branch}/schedules/{schedule}', [BranchController::class, 'deleteSchedule'])->middleware('module:branches,edit');

        // --- Leave --------------------------------------------------------
        // ESS (own record only).
        Route::get('leave/my', [LeaveController::class, 'my']);
        Route::post('leave/requests', [LeaveController::class, 'store']);
        Route::post('leave/requests/{id}/cancel', [LeaveController::class, 'cancel'])->whereNumber('id');
        // HR.
        Route::get('leave/requests', [LeaveController::class, 'index'])->middleware('module:leave,view');
        Route::get('leave/types', [LeaveController::class, 'types'])->middleware('module:leave,view');
        Route::post('leave/types', [LeaveController::class, 'saveType'])->middleware('module:leave,edit');
        Route::post('leave/requests/{leave}/act', [LeaveController::class, 'act'])->middleware('module:leave,approve');

        // --- Service Credits ----------------------------------------------
        // ESS (own record only).
        Route::get('service-credits/my', [ServiceCreditController::class, 'my']);
        Route::post('service-credits/requests', [ServiceCreditController::class, 'store']);
        Route::post('service-credits/requests/{id}/cancel', [ServiceCreditController::class, 'cancel'])->whereNumber('id');
        // HR.
        Route::get('service-credits/requests', [ServiceCreditController::class, 'index'])->middleware('module:service_credits,view');
        Route::post('service-credits/grant', [ServiceCreditController::class, 'grant'])->middleware('module:service_credits,create');
        Route::post('service-credits/requests/{credit}/act', [ServiceCreditController::class, 'act'])->middleware('module:service_credits,approve');

        // --- Announcements -------------------------------------------------
        Route::get('announcements/feed', [AnnouncementController::class, 'feed']); // employee view-only
        Route::get('announcements', [AnnouncementController::class, 'index'])->middleware('module:announcements,view');
        Route::post('announcements', [AnnouncementController::class, 'store'])->middleware('module:announcements,create');
        Route::put('announcements/{announcement}', [AnnouncementController::class, 'update'])->middleware('module:announcements,edit');
        Route::delete('announcements/{announcement}', [AnnouncementController::class, 'destroy'])->middleware('module:announcements,delete');

        // --- Payroll -------------------------------------------------------
        Route::get('payroll/my', [PayrollController::class, 'my']); // ESS payslips
        Route::get('payroll/periods', [PayrollController::class, 'index'])->middleware('module:payroll,view');
        Route::post('payroll/periods', [PayrollController::class, 'store'])->middleware('module:payroll,create');
        Route::get('payroll/periods/{period}', [PayrollController::class, 'show'])->middleware('module:payroll,view');
        Route::post('payroll/periods/{period}/regenerate', [PayrollController::class, 'regenerate'])->middleware('module:payroll,edit');
        Route::post('payroll/periods/{period}/finalize', [PayrollController::class, 'finalize'])->middleware('module:payroll,approve');
        Route::delete('payroll/periods/{period}', [PayrollController::class, 'destroy'])->middleware('module:payroll,delete');

        // --- Recruitment ---------------------------------------------------
        Route::get('recruitment/openings', [RecruitmentController::class, 'index'])->middleware('module:recruitment,view');
        Route::post('recruitment/openings', [RecruitmentController::class, 'store'])->middleware('module:recruitment,create');
        Route::get('recruitment/openings/{opening}', [RecruitmentController::class, 'show'])->middleware('module:recruitment,view');
        Route::put('recruitment/openings/{opening}', [RecruitmentController::class, 'update'])->middleware('module:recruitment,edit');
        Route::delete('recruitment/openings/{opening}', [RecruitmentController::class, 'destroy'])->middleware('module:recruitment,delete');
        Route::get('recruitment/applications', [RecruitmentController::class, 'applications'])->middleware('module:recruitment,view');
        Route::get('recruitment/applications/{application}', [RecruitmentController::class, 'application'])->middleware('module:recruitment,view');
        Route::post('recruitment/applications/{application}/status', [RecruitmentController::class, 'updateApplication'])->middleware('module:recruitment,edit');

        // --- User management ----------------------------------------------
        Route::get('users', [UserController::class, 'index'])->middleware('module:users,view');
        Route::post('users', [UserController::class, 'store'])->middleware('module:users,create');
        Route::put('users/{user}', [UserController::class, 'update'])->middleware('module:users,edit');
        Route::delete('users/{user}', [UserController::class, 'destroy'])->middleware('module:users,delete');
        Route::post('users/{user}/reset-password', [UserController::class, 'resetPassword'])->middleware('module:users,edit');

        // --- Billing -------------------------------------------------------
        Route::get('billing', [BillingController::class, 'index'])->middleware('module:billing,view');
        Route::put('billing/plan', [BillingController::class, 'updatePlan'])->middleware('module:billing,edit');
        Route::post('billing/invoices', [BillingController::class, 'storeInvoice'])->middleware('module:billing,create');
        Route::post('billing/generate-invoice', [BillingController::class, 'generateInvoice'])->middleware('module:billing,create');
        Route::post('billing/invoices/{invoice}/pay', [BillingController::class, 'markPaid'])->middleware('module:billing,edit');
        Route::delete('billing/invoices/{invoice}', [BillingController::class, 'destroyInvoice'])->middleware('module:billing,delete');

        // --- System settings (SuperAdmin / settings module) -------------
        Route::get('settings', [SettingController::class, 'index'])->middleware('module:settings,view');
        Route::post('settings', [SettingController::class, 'update'])->middleware('module:settings,edit');
    });
});
