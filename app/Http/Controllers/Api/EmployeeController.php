<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\EmployeeRequest;
use App\Http\Resources\EmployeeResource;
use App\Models\Employee;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class EmployeeController extends Controller
{
    public function index(Request $request)
    {
        $q = Employee::query()->with(['branch', 'department', 'position']);

        if ($search = $request->string('search')->trim()->value()) {
            $q->where(fn ($w) => $w
                ->where('first_name', 'like', "%{$search}%")
                ->orWhere('last_name', 'like', "%{$search}%")
                ->orWhere('employee_no', 'like', "%{$search}%")
                ->orWhere('email', 'like', "%{$search}%"));
        }
        if ($request->filled('branch_id')) {
            $q->where('branch_id', $request->integer('branch_id'));
        }
        if ($request->filled('department_id')) {
            $q->where('department_id', $request->integer('department_id'));
        }
        if ($request->filled('status')) {
            $q->where('status', $request->string('status'));
        }

        $employees = $q->orderBy('last_name')->paginate($request->integer('per_page', 20));

        return EmployeeResource::collection($employees);
    }

    /** Flat list for building the per-branch org chart tree client-side. */
    public function orgChart(Request $request)
    {
        $q = Employee::query()->with('position:id,title')
            ->when($request->filled('branch_id'), fn ($w) => $w->where('branch_id', $request->integer('branch_id')));

        return $q->get(['id', 'first_name', 'last_name', 'manager_id', 'position_id', 'photo_path'])
            ->map(fn ($e) => [
                'id' => $e->id,
                'name' => $e->full_name,
                'manager_id' => $e->manager_id,
                'position' => $e->position?->title,
                'photo_url' => $e->photo_path ? asset('storage/' . $e->photo_path) : null,
            ]);
    }

    public function store(EmployeeRequest $request): JsonResponse
    {
        $data = $request->validated();
        $data['company_id'] = $request->user()->company_id;

        if ($request->hasFile('photo')) {
            $data['photo_path'] = $request->file('photo')->store("employees/{$data['branch_id']}", 'public');
        }

        $employee = Employee::create($data);

        return (new EmployeeResource($employee->load(['branch', 'department', 'position'])))
            ->response()->setStatusCode(201);
    }

    public function show(Employee $employee)
    {
        return new EmployeeResource($employee->load([
            'branch', 'department', 'position', 'manager',
            'dependents', 'emergencyContacts', 'histories', 'documents',
        ]));
    }

    public function update(EmployeeRequest $request, Employee $employee)
    {
        $data = $request->validated();

        if ($request->hasFile('photo')) {
            $data['photo_path'] = $request->file('photo')->store("employees/{$employee->branch_id}", 'public');
        }

        $employee->update($data);

        return new EmployeeResource($employee->load(['branch', 'department', 'position']));
    }

    public function destroy(Request $request, Employee $employee): JsonResponse
    {
        abort_unless($request->user()->canModule('employees', 'delete'), 403);
        $employee->delete();

        return response()->json(['message' => 'Employee archived.']);
    }

    /**
     * Provision an ESS login for an employee and (in dev, MAIL=log) "send"
     * the credentials. Returns the temporary password so HR can relay it.
     */
    public function provisionAccount(Request $request, Employee $employee): JsonResponse
    {
        abort_unless($request->user()->canModule('employees', 'create'), 403);

        if ($employee->user_id) {
            return response()->json(['message' => 'This employee already has a login.'], 422);
        }
        if (! $employee->email) {
            return response()->json(['message' => 'Add an email to the employee before creating a login.'], 422);
        }

        $tempPassword = Str::password(10);
        $user = User::create([
            'name' => $employee->full_name,
            'email' => $employee->email,
            'password' => Hash::make($tempPassword),
            'company_id' => $employee->company_id,
            'preset' => 'employee',
        ]);
        $user->branches()->sync([$employee->branch_id]);
        $employee->update(['user_id' => $user->id]);

        // MAIL_MAILER=log in dev — the credential mail lands in the log.
        // TODO(prod): queue a real Mailable with a reset-on-first-login link.

        return response()->json([
            'message' => "Login created for {$employee->email}.",
            'temp_password' => $tempPassword,
        ]);
    }
}
