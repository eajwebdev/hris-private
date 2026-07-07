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

        return response()->json([
            'headcount' => Employee::whereIn('status', ['regular', 'probationary'])->count(),
            'present_today' => $todayRows->pluck('employee_id')->unique()->count(),
            'on_leave' => 0, // wired when Leave ships
            'late_today' => $todayRows->filter(fn ($a) => $a->late_am_minutes > 0 || $a->late_pm_minutes > 0)->count(),
            'open_positions' => Position::count(),
            'pending_approvals' => 0,
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
        $counts = Attendance::whereIn('work_date', $days->all())
            ->selectRaw('work_date, count(distinct employee_id) as present')
            ->groupBy('work_date')->pluck('present', 'work_date');

        return $days->map(fn ($d) => [
            'date' => \Illuminate\Support\Carbon::parse($d)->format('D'),
            'present' => (int) ($counts[$d] ?? 0),
        ])->all();
    }

    /** Employee self-service summary. */
    public function essSummary(Request $request): JsonResponse
    {
        $user = $request->user();
        $employee = Employee::withoutGlobalScopes()->with('branch', 'position', 'department')
            ->where('user_id', $user->id)->first();

        $todayAttendance = null;
        if ($employee) {
            $todayAttendance = Attendance::withoutGlobalScopes()
                ->where('employee_id', $employee->id)->where('work_date', now()->toDateString())->first();
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
            ] : ['next_action' => 'in', 'worked_hours' => 0, 'punches' => []],
            'leave_balance' => null, // wired when Leave ships
        ]);
    }
}
