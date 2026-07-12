<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\EmployeeResource;
use App\Models\Employee;
use App\Models\JobOpening;
use App\Models\LeaveRequest;
use App\Models\ServiceCredit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * Employee self-service: own 201 file and the internal job board.
 *
 * Everything here is scoped to the employee behind the token, so the queries
 * drop the branch global scope and filter on `user_id` instead.
 */
class ProfileController extends Controller
{
    private function currentEmployee(Request $request): Employee
    {
        $employee = Employee::withoutGlobalScopes()->where('user_id', $request->user()->id)->first();
        abort_unless($employee, 422, 'Your login isn’t linked to an employee record. Ask HR to connect it.');

        return $employee;
    }

    /** The employee's own 201 file, read-only apart from their contact details. */
    public function show(Request $request): JsonResponse
    {
        $employee = $this->currentEmployee($request);
        $employee->load(['branch', 'department', 'position', 'manager', 'dependents', 'emergencyContacts', 'histories', 'documents']);

        $year = now()->year;

        return response()->json([
            'employee' => (new EmployeeResource($employee))->toArray($request),
            'summary' => [
                'tenure_years' => $employee->date_hired
                    ? round($employee->date_hired->diffInDays(now()) / 365.25, 1)
                    : null,
                'service_credits' => ServiceCredit::balanceFor($employee->id),
                'leave_taken_this_year' => (float) LeaveRequest::withoutGlobalScopes()
                    ->where('employee_id', $employee->id)->where('status', 'approved')
                    ->whereYear('date_from', $year)->sum('days'),
            ],
        ]);
    }

    /**
     * Employees may maintain their own contact details and emergency contacts.
     * Employment terms (salary, position, status) stay with HR.
     */
    public function update(Request $request): JsonResponse
    {
        $employee = $this->currentEmployee($request);

        $data = $request->validate([
            'phone' => ['nullable', 'string', 'max:40'],
            'address' => ['nullable', 'string', 'max:500'],
            'emergency_contacts' => ['present', 'array', 'max:5'],
            'emergency_contacts.*.name' => ['required', 'string', 'max:120'],
            'emergency_contacts.*.relationship' => ['nullable', 'string', 'max:60'],
            'emergency_contacts.*.phone' => ['required', 'string', 'max:40'],
            'emergency_contacts.*.address' => ['nullable', 'string', 'max:255'],
        ]);

        DB::transaction(function () use ($employee, $data) {
            $employee->update([
                'phone' => $data['phone'] ?? null,
                'address' => $data['address'] ?? null,
            ]);

            $employee->emergencyContacts()->delete();
            foreach ($data['emergency_contacts'] as $c) {
                $employee->emergencyContacts()->create([
                    'name' => $c['name'],
                    'relationship' => $c['relationship'] ?? null,
                    'phone' => $c['phone'],
                    'address' => $c['address'] ?? null,
                ]);
            }
        });

        return response()->json(['message' => 'Profile updated.']);
    }

    /** Change own password. */
    public function changePassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        $user = $request->user();

        if (! Hash::check($data['current_password'], $user->password)) {
            return response()->json(['message' => 'Your current password is incorrect.'], 422);
        }

        $user->update(['password' => Hash::make($data['password'])]);

        return response()->json(['message' => 'Password changed.']);
    }

    /**
     * Internal job board — the same published openings as the public careers
     * portal. Applying happens there, so the apply flow (and its required-document
     * checklist) lives in exactly one place.
     */
    public function jobs(Request $request): JsonResponse
    {
        $employee = Employee::withoutGlobalScopes()->where('user_id', $request->user()->id)->first();

        $openings = JobOpening::withoutGlobalScopes()
            ->with('branch:id,name')->withCount('requirements')
            ->where('company_id', $request->user()->company_id)
            ->where('status', 'open')
            ->whereNotNull('published_at')
            ->orderByDesc('published_at')
            ->get()
            ->map(fn ($o) => [
                'id' => $o->id,
                'title' => $o->title,
                'slug' => $o->slug,
                'branch' => $o->branch?->name,
                'department' => $o->department,
                'employment_type' => $o->employment_type,
                'location' => $o->location,
                'salary_range' => $o->salary_range,
                'openings_count' => $o->openings_count,
                'requirements_count' => $o->requirements_count ?? 0,
                'published_at' => $o->published_at?->toIso8601String(),
                // Flag roles at the employee's own branch — the likeliest move.
                'is_own_branch' => $employee && $o->branch_id === $employee->branch_id,
            ]);

        return response()->json(['data' => $openings]);
    }
}
