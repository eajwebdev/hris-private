<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Auditor;
use App\Models\Branch;
use App\Models\WorkSchedule;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BranchController extends Controller
{
    /** Branches the user can see, with headcount + schedules. */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $branches = Branch::withCount('employees')
            ->with('schedules')
            ->where('company_id', $user->company_id)
            ->when(! $user->is_super_admin, fn ($q) => $q->whereIn('id', $user->accessibleBranchIds()))
            ->orderBy('name')
            ->get()
            ->map(fn ($b) => $this->shape($b));

        return response()->json(['data' => $branches]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validateBranch($request);
        $branch = Branch::create(array_merge($data, ['company_id' => $request->user()->company_id]));

        // Give the creator access to the branch they just made.
        $request->user()->branches()->syncWithoutDetaching([$branch->id]);

        Auditor::record('branches', 'created', "Created branch {$branch->name}.", $branch, null, $branch->id);

        return response()->json(['message' => 'Branch created.', 'branch' => $this->shape($branch->loadCount('employees')->load('schedules'))], 201);
    }

    public function update(Request $request, Branch $branch): JsonResponse
    {
        $before = Auditor::before($branch);
        $branch->update($this->validateBranch($request, $branch->id));

        Auditor::record('branches', 'updated', "Updated branch {$branch->name}.", $branch, Auditor::diff($branch, $before), $branch->id);

        return response()->json(['message' => 'Branch updated.', 'branch' => $this->shape($branch->fresh()->loadCount('employees')->load('schedules'))]);
    }

    public function destroy(Branch $branch): JsonResponse
    {
        if ($branch->employees()->exists()) {
            return response()->json(['message' => 'This branch still has employees. Transfer them before archiving it.'], 422);
        }
        Auditor::record('branches', 'deleted', "Archived branch {$branch->name}.", $branch, null, $branch->id);

        $branch->delete();

        return response()->json(['message' => 'Branch archived.']);
    }

    /** Create or update a work schedule under a branch. */
    public function saveSchedule(Request $request, Branch $branch): JsonResponse
    {
        $data = $request->validate([
            'id' => ['nullable', 'integer'],
            'name' => ['required', 'string', 'max:80'],
            'morning_in' => ['required', 'date_format:H:i'],
            'morning_out' => ['required', 'date_format:H:i', 'after:morning_in'],
            'afternoon_in' => ['required', 'date_format:H:i', 'after_or_equal:morning_out'],
            'afternoon_out' => ['required', 'date_format:H:i', 'after:afternoon_in'],
            'grace_minutes' => ['required', 'integer', 'min:0', 'max:120'],
            'is_default' => ['boolean'],
        ]);

        $schedule = null;
        if (! empty($data['id'])) {
            $schedule = WorkSchedule::where('branch_id', $branch->id)->findOrFail($data['id']);
        }

        // Only one default per branch.
        if (! empty($data['is_default'])) {
            WorkSchedule::where('branch_id', $branch->id)->update(['is_default' => false]);
        }

        $payload = array_merge($data, ['branch_id' => $branch->id]);
        unset($payload['id']);
        $schedule = $schedule ? tap($schedule)->update($payload) : WorkSchedule::create($payload);

        return response()->json(['message' => 'Schedule saved.', 'schedule' => $schedule->fresh()]);
    }

    public function deleteSchedule(Branch $branch, WorkSchedule $schedule): JsonResponse
    {
        abort_unless($schedule->branch_id === $branch->id, 404);
        $schedule->delete();

        return response()->json(['message' => 'Schedule removed.']);
    }

    private function validateBranch(Request $request, ?int $ignoreId = null): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'code' => ['required', 'string', 'max:20', 'unique:branches,code' . ($ignoreId ? ",{$ignoreId}" : '')],
            'address' => ['nullable', 'string', 'max:255'],
            'latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'geofence_radius' => ['nullable', 'integer', 'min:10', 'max:5000'],
            'timezone' => ['nullable', 'string', 'max:64', 'timezone'],
            'is_active' => ['boolean'],
        ]);
    }

    private function shape(Branch $b): array
    {
        return [
            'id' => $b->id,
            'name' => $b->name,
            'code' => $b->code,
            'address' => $b->address,
            'latitude' => $b->latitude,
            'longitude' => $b->longitude,
            'geofence_radius' => $b->geofence_radius,
            'timezone' => $b->timezone,
            'is_active' => $b->is_active,
            'employees_count' => $b->employees_count ?? 0,
            'schedules' => $b->schedules->map(fn ($s) => [
                'id' => $s->id,
                'name' => $s->name,
                'morning_in' => substr($s->morning_in, 0, 5),
                'morning_out' => substr($s->morning_out, 0, 5),
                'afternoon_in' => substr($s->afternoon_in, 0, 5),
                'afternoon_out' => substr($s->afternoon_out, 0, 5),
                'grace_minutes' => $s->grace_minutes,
                'is_default' => $s->is_default,
            ]),
        ];
    }
}
