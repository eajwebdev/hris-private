<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Attendance;
use App\Models\Employee;
use App\Models\Event;
use App\Models\Position;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    /** Admin KPI summary (branch-scoped via global scopes). */
    public function adminSummary(Request $request): JsonResponse
    {
        $today = now()->toDateString();
        $todayRows = Attendance::where('work_date', $today)->get();
        $headcount = Employee::whereIn('status', ['regular', 'probationary'])->count();
        $presentToday = $todayRows->pluck('employee_id')->unique()->count();

        return response()->json([
            'headcount' => $headcount,
            'present_today' => $presentToday,
            'absent_today' => max(0, $headcount - $presentToday),
            'on_leave' => \App\Models\LeaveRequest::where('status', 'approved')
                ->whereDate('date_from', '<=', $today)->whereDate('date_to', '>=', $today)
                ->distinct('employee_id')->count('employee_id'),
            'late_today' => $todayRows->filter(fn ($a) => $a->late_am_minutes > 0 || $a->late_pm_minutes > 0)->count(),
            'late_minutes_today' => (int) $todayRows->sum(fn ($a) => $a->late_am_minutes + $a->late_pm_minutes),
            'early_out_today' => $todayRows->filter(fn ($a) => $a->early_out_minutes > 0)->count(),
            'open_positions' => Position::count(),
            'pending_approvals' => \App\Models\LeaveRequest::where('status', 'pending')->count()
                + \App\Models\ServiceCredit::where('status', 'pending')->count(),
            'headcount_by_dept' => Employee::selectRaw('department_id, count(*) as c')
                ->with('department:id,name')->groupBy('department_id')->get()
                ->map(fn ($r) => ['name' => $r->department?->name ?? 'Unassigned', 'value' => (int) $r->c])
                ->values(),
            'attendance_trend' => $this->attendanceTrend(),
            'upcoming_events' => Event::where('company_id', $request->user()->company_id)
                ->where('starts_at', '>=', now()->startOfDay())->orderBy('starts_at')->limit(5)
                ->get(['id', 'title', 'starts_at', 'location', 'color']),
        ]);
    }

    private function attendanceTrend(): array
    {
        $days = collect(range(6, 0))->map(fn ($d) => now()->subDays($d)->toDateString());
        $rows = Attendance::whereIn('work_date', $days->all())
            ->get(['work_date', 'employee_id', 'late_am_minutes', 'late_pm_minutes'])
            ->groupBy(fn ($a) => $a->work_date->toDateString());

        return $days->map(function ($d) use ($rows) {
            $day = $rows->get($d, collect());

            return [
                'date' => \Illuminate\Support\Carbon::parse($d)->format('D'),
                'present' => $day->pluck('employee_id')->unique()->count(),
                'late' => $day->filter(fn ($a) => $a->late_am_minutes > 0 || $a->late_pm_minutes > 0)->count(),
            ];
        })->all();
    }

    /** Employee self-service summary. */
    public function essSummary(Request $request): JsonResponse
    {
        $user = $request->user();
        $employee = Employee::withoutGlobalScopes()->with('branch', 'position', 'department')
            ->where('user_id', $user->id)->first();

        $todayAttendance = null;
        $schedule = null;
        $month = null;
        $recentDtr = [];
        if ($employee) {
            $todayAttendance = Attendance::withoutGlobalScopes()
                ->where('employee_id', $employee->id)->where('work_date', now()->toDateString())->first();

            $schedule = \App\Models\WorkSchedule::forEmployee($employee);

            // Recent Daily Time Record — last 7 logged days, newest first.
            $recentDtr = Attendance::withoutGlobalScopes()
                ->where('employee_id', $employee->id)
                ->orderByDesc('work_date')->limit(7)->get()
                ->map(fn ($a) => [
                    'date' => $a->work_date->toDateString(),
                    'dtr' => $a->dtr,
                    'worked_hours' => (float) $a->worked_hours,
                    'late_minutes' => (int) ($a->late_am_minutes + $a->late_pm_minutes),
                    'early_out_minutes' => (int) $a->early_out_minutes,
                    'undertime_minutes' => (int) $a->undertime_minutes,
                    'is_incomplete' => (bool) $a->is_incomplete,
                ]);

            // This-month punctuality, computed against the employee's schedule
            // (minutes are evaluated per-day by AttendanceService on each punch).
            $monthRows = Attendance::withoutGlobalScopes()
                ->where('employee_id', $employee->id)
                ->whereBetween('work_date', [now()->startOfMonth()->toDateString(), now()->endOfMonth()->toDateString()])
                ->get();

            $month = [
                'label' => now()->format('F Y'),
                'days_present' => $monthRows->count(),
                'late_count' => $monthRows->filter(fn ($a) => $a->late_am_minutes + $a->late_pm_minutes > 0)->count(),
                'late_minutes' => (int) $monthRows->sum(fn ($a) => $a->late_am_minutes + $a->late_pm_minutes),
                'early_out_count' => $monthRows->filter(fn ($a) => $a->early_out_minutes > 0)->count(),
                'early_out_minutes' => (int) $monthRows->sum('early_out_minutes'),
                'undertime_minutes' => (int) $monthRows->sum('undertime_minutes'),
                'worked_hours' => round((float) $monthRows->sum('worked_hours'), 2),
            ];
        }

        return response()->json([
            'employee' => $employee ? [
                'id' => $employee->id,
                'name' => $employee->full_name,
                'position' => $employee->position?->title,
                'department' => $employee->department?->name,
                'branch' => $employee->branch?->name,
                'photo_url' => $employee->photo_path ? asset('storage/' . $employee->photo_path) : null,
                'status' => $employee->status,
            ] : null,
            'today' => $todayAttendance ? [
                'next_action' => $todayAttendance->next_action,
                'worked_hours' => (float) $todayAttendance->worked_hours,
                'punches' => $todayAttendance->punches,
                'late_minutes' => (int) ($todayAttendance->late_am_minutes + $todayAttendance->late_pm_minutes),
                'early_out_minutes' => (int) $todayAttendance->early_out_minutes,
                'undertime_minutes' => (int) $todayAttendance->undertime_minutes,
            ] : ['next_action' => 'in', 'worked_hours' => 0, 'punches' => [], 'late_minutes' => 0, 'early_out_minutes' => 0, 'undertime_minutes' => 0],
            'schedule' => $schedule ? [
                'name' => $schedule->name,
                'morning_in' => $schedule->morning_in,
                'morning_out' => $schedule->morning_out,
                'afternoon_in' => $schedule->afternoon_in,
                'afternoon_out' => $schedule->afternoon_out,
                'grace_minutes' => (int) $schedule->grace_minutes,
            ] : null,
            'month' => $month,
            'recent_dtr' => $recentDtr,
            'service_credits' => $employee ? \App\Models\ServiceCredit::balanceFor($employee->id) : 0,
            'leave_balance' => null, // wired when Leave ships
        ]);
    }
}
