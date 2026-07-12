<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Auditor;
use App\Http\Resources\AttendanceResource;
use App\Models\Attendance;
use App\Models\Employee;
use App\Models\WorkSchedule;
use App\Services\AttendanceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class AttendanceController extends Controller
{
    public function __construct(private AttendanceService $service) {}

    /** Resolve the employee record for the authenticated user (ESS). */
    private function currentEmployee(Request $request): Employee
    {
        $employee = Employee::withoutGlobalScopes()->with('branch')->where('user_id', $request->user()->id)->first();
        abort_unless($employee, 422, 'Your login isn’t linked to an employee record. Ask HR to connect it.');

        return $employee;
    }

    /** The authenticated employee's attendance for today + their schedule. */
    public function today(Request $request): JsonResponse
    {
        $employee = $this->currentEmployee($request);
        $date = Carbon::now($employee->branch?->timezone ?? config('app.timezone'))->toDateString();

        $attendance = Attendance::withoutGlobalScopes()
            ->where('employee_id', $employee->id)->where('work_date', $date)->first();

        return response()->json([
            'attendance' => $attendance ? new AttendanceResource($attendance) : null,
            'next_action' => $attendance?->next_action ?? 'in',
            'schedule' => WorkSchedule::forEmployee($employee),
            'server_time' => Carbon::now($employee->branch?->timezone ?? config('app.timezone'))->toIso8601String(),
        ]);
    }

    /** ESS clock in/out. Photo compressed client-side; server validates + stores. */
    public function punch(Request $request): JsonResponse
    {
        $data = $request->validate([
            'type' => ['required', 'in:in,out'],
            'lat' => ['nullable', 'numeric', 'between:-90,90'],
            'lng' => ['nullable', 'numeric', 'between:-180,180'],
            'accuracy' => ['nullable', 'numeric'],
            'photo' => ['nullable', 'image', 'max:1024'], // low-KB compressed JPEG
        ]);

        $employee = $this->currentEmployee($request);

        // Enforce the sensible next action (can't clock out before in, etc.).
        $date = Carbon::now($employee->branch?->timezone ?? config('app.timezone'))->toDateString();
        $existing = Attendance::withoutGlobalScopes()->where('employee_id', $employee->id)->where('work_date', $date)->first();
        $expected = $existing?->next_action ?? 'in';
        if ($data['type'] !== $expected) {
            return response()->json(['message' => "You need to clock {$expected} next."], 422);
        }

        $attendance = $this->service->punch($employee, $data['type'], [
            'lat' => $data['lat'] ?? null,
            'lng' => $data['lng'] ?? null,
            'photo' => $request->file('photo'),
        ]);

        $label = $data['type'] === 'in' ? 'Clocked in' : 'Clocked out';
        $time = Carbon::now($employee->branch?->timezone ?? config('app.timezone'))->format('g:i A');

        return response()->json([
            'message' => "{$label} · {$time}",
            'attendance' => new AttendanceResource($attendance),
            'next_action' => $attendance->next_action,
        ]);
    }

    /** HR "who's in" board — employees currently clocked in today. */
    public function monitor(Request $request): JsonResponse
    {
        $date = now()->toDateString();
        $rows = Attendance::with('employee.position', 'employee.department')
            ->where('work_date', $date)
            ->when($request->filled('branch_id'), fn ($q) => $q->where('branch_id', $request->integer('branch_id')))
            ->get();

        $present = $rows->filter(fn ($a) => $a->next_action === 'out'); // clocked in, not yet out

        return response()->json([
            'date' => $date,
            'present_count' => $present->count(),
            'total_punched' => $rows->count(),
            'present' => AttendanceResource::collection($present->values()),
            'all' => AttendanceResource::collection($rows),
        ]);
    }

    /** Attendance records list for HR with filters. */
    public function index(Request $request)
    {
        $q = Attendance::with('employee.position')
            ->when($request->filled('branch_id'), fn ($w) => $w->where('branch_id', $request->integer('branch_id')))
            ->when($request->filled('employee_id'), fn ($w) => $w->where('employee_id', $request->integer('employee_id')))
            ->when($request->filled('from'), fn ($w) => $w->whereDate('work_date', '>=', $request->date('from')))
            ->when($request->filled('to'), fn ($w) => $w->whereDate('work_date', '<=', $request->date('to')))
            ->orderByDesc('work_date');

        return AttendanceResource::collection($q->paginate($request->integer('per_page', 30)));
    }

    public function show(Attendance $attendance)
    {
        return new AttendanceResource($attendance->load('employee.position', 'employee.department'));
    }

    /** Manual correction with audit note (module:attendance,edit). */
    public function correct(Request $request, Attendance $attendance): JsonResponse
    {
        $data = $request->validate([
            'clock_ins' => ['nullable', 'string'],
            'clock_outs' => ['nullable', 'string'],
            'note' => ['required', 'string', 'max:500'],
        ]);

        $before = Auditor::before($attendance);

        $attendance->clock_ins = $data['clock_ins'] ?? $attendance->clock_ins;
        $attendance->clock_outs = $data['clock_outs'] ?? $attendance->clock_outs;
        $attendance->note = '[' . now()->toDateString() . ' by ' . $request->user()->name . '] ' . $data['note'];

        $employee = Employee::withoutGlobalScopes()->find($attendance->employee_id);
        $this->service->evaluate($attendance, WorkSchedule::forEmployee($employee));
        $attendance->save();

        Auditor::record(
            'attendance',
            'corrected',
            trim(($employee?->full_name ?? 'Employee') . ' · ' . $attendance->work_date->toDateString() . ' — ' . $data['note']),
            $attendance,
            Auditor::diff($attendance, $before),
        );

        return response()->json(['message' => 'Attendance corrected.', 'attendance' => new AttendanceResource($attendance)]);
    }
}
