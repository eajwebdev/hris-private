<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\JobApplication;
use App\Models\JobOpening;
use App\Services\Notifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RecruitmentController extends Controller
{
    // ---------------------------------------------------------- Openings

    public function index(Request $request): JsonResponse
    {
        $openings = JobOpening::with('branch:id,name', 'creator:id,name', 'requirements')
            ->withCount(['applications', 'applications as new_applications_count' => fn ($q) => $q->where('status', 'applied')])
            ->where('company_id', $request->user()->company_id)
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->orderByDesc('created_at')
            ->get()->map(fn ($o) => $this->shapeOpening($o));

        return response()->json(['data' => $openings]);
    }

    public function show(Request $request, JobOpening $opening): JsonResponse
    {
        abort_unless($opening->company_id === $request->user()->company_id, 404);

        return response()->json([
            'opening' => $this->shapeOpening($opening->loadCount('applications')->load('branch', 'creator', 'requirements')),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validateOpening($request);
        $user = $request->user();

        $opening = JobOpening::create([
            'company_id' => $user->company_id,
            'branch_id' => $data['branch_id'] ?? null,
            'position_id' => $data['position_id'] ?? null,
            'title' => $data['title'],
            'slug' => JobOpening::uniqueSlug($data['title']),
            'department' => $data['department'] ?? null,
            'employment_type' => $data['employment_type'] ?? 'full_time',
            'location' => $data['location'] ?? null,
            'salary_range' => $data['salary_range'] ?? null,
            'openings_count' => $data['openings_count'] ?? 1,
            'description' => $data['description'] ?? null,
            'status' => $data['status'] ?? 'open',
            'created_by' => $user->id,
            'published_at' => ($data['status'] ?? 'open') === 'open' ? now() : null,
        ]);

        // Seed the requirements: HR-provided list, else the sensible defaults.
        $this->syncRequirements($opening, $data['requirements'] ?? JobOpening::DEFAULT_REQUIREMENTS);

        return response()->json(['message' => 'Job opening created.', 'opening' => $this->shapeOpening($opening->load('requirements', 'branch', 'creator'))], 201);
    }

    public function update(Request $request, JobOpening $opening): JsonResponse
    {
        abort_unless($opening->company_id === $request->user()->company_id, 404);
        $data = $this->validateOpening($request);

        $wasPublished = $opening->published_at !== null;
        $opening->update([
            'branch_id' => $data['branch_id'] ?? null,
            'position_id' => $data['position_id'] ?? null,
            'title' => $data['title'],
            'department' => $data['department'] ?? null,
            'employment_type' => $data['employment_type'] ?? 'full_time',
            'location' => $data['location'] ?? null,
            'salary_range' => $data['salary_range'] ?? null,
            'openings_count' => $data['openings_count'] ?? 1,
            'description' => $data['description'] ?? null,
            'status' => $data['status'] ?? 'open',
            'published_at' => ($data['status'] ?? 'open') === 'open' ? ($opening->published_at ?? now()) : ($wasPublished ? $opening->published_at : null),
        ]);

        if (array_key_exists('requirements', $data)) {
            $this->syncRequirements($opening, $data['requirements']);
        }

        return response()->json(['message' => 'Job opening updated.', 'opening' => $this->shapeOpening($opening->fresh()->load('requirements', 'branch', 'creator'))]);
    }

    public function destroy(Request $request, JobOpening $opening): JsonResponse
    {
        abort_unless($opening->company_id === $request->user()->company_id, 404);
        $opening->delete();

        return response()->json(['message' => 'Job opening removed.']);
    }

    /** Replace the opening's requirement checklist (HR add/edit/delete). */
    private function syncRequirements(JobOpening $opening, array $requirements): void
    {
        $opening->requirements()->delete();
        foreach (array_values($requirements) as $i => $req) {
            if (empty($req['name'])) {
                continue;
            }
            $opening->requirements()->create([
                'name' => $req['name'],
                'description' => $req['description'] ?? null,
                'is_required' => (bool) ($req['is_required'] ?? true),
                'sort' => $i,
            ]);
        }
    }

    // ------------------------------------------------------ Applications

    public function applications(Request $request)
    {
        $companyId = $request->user()->company_id;

        $q = JobApplication::with('opening:id,title', 'documents')
            ->whereHas('opening', fn ($w) => $w->where('company_id', $companyId))
            ->when($request->filled('opening_id'), fn ($w) => $w->where('job_opening_id', $request->integer('opening_id')))
            ->when($request->filled('status'), fn ($w) => $w->where('status', $request->string('status')))
            ->orderByDesc('created_at');

        $page = $q->paginate($request->integer('per_page', 15));
        $page->getCollection()->transform(fn ($a) => $this->shapeApplication($a));

        return $page;
    }

    public function application(Request $request, JobApplication $application): JsonResponse
    {
        abort_unless($application->opening->company_id === $request->user()->company_id, 404);

        return response()->json(['application' => $this->shapeApplication($application->load('documents', 'opening:id,title', 'reviewer:id,name'), full: true)]);
    }

    public function updateApplication(Request $request, JobApplication $application): JsonResponse
    {
        abort_unless($application->opening->company_id === $request->user()->company_id, 404);

        $data = $request->validate([
            'status' => ['required', 'in:' . implode(',', JobApplication::STATUSES)],
            'rating' => ['nullable', 'integer', 'min:1', 'max:5'],
            'hr_notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $application->update([
            'status' => $data['status'],
            'rating' => $data['rating'] ?? $application->rating,
            'hr_notes' => $data['hr_notes'] ?? $application->hr_notes,
            'reviewed_by' => $request->user()->id,
            'reviewed_at' => now(),
        ]);

        return response()->json(['message' => 'Application updated.', 'application' => $this->shapeApplication($application->fresh()->load('documents', 'reviewer:id,name'), full: true)]);
    }

    // ------------------------------------------------------------ shapes

    private function validateOpening(Request $request): array
    {
        return $request->validate([
            'title' => ['required', 'string', 'max:150'],
            'branch_id' => ['nullable', 'exists:branches,id'],
            'position_id' => ['nullable', 'exists:positions,id'],
            'department' => ['nullable', 'string', 'max:120'],
            'employment_type' => ['nullable', 'in:full_time,part_time,contract,internship'],
            'location' => ['nullable', 'string', 'max:150'],
            'salary_range' => ['nullable', 'string', 'max:80'],
            'openings_count' => ['nullable', 'integer', 'min:1', 'max:999'],
            'description' => ['nullable', 'string', 'max:20000'],
            'status' => ['nullable', 'in:open,closed,draft'],
            'requirements' => ['sometimes', 'array'],
            'requirements.*.name' => ['required_with:requirements', 'string', 'max:120'],
            'requirements.*.description' => ['nullable', 'string', 'max:255'],
            'requirements.*.is_required' => ['nullable', 'boolean'],
        ]);
    }

    private function shapeOpening(JobOpening $o): array
    {
        return [
            'id' => $o->id,
            'title' => $o->title,
            'slug' => $o->slug,
            'branch_id' => $o->branch_id,
            'branch' => $o->branch?->name,
            'position_id' => $o->position_id,
            'department' => $o->department,
            'employment_type' => $o->employment_type,
            'location' => $o->location,
            'salary_range' => $o->salary_range,
            'openings_count' => $o->openings_count,
            'description' => $o->description,
            'status' => $o->status,
            'created_by' => $o->creator?->name,
            'published_at' => $o->published_at?->toIso8601String(),
            'created_at' => $o->created_at->toIso8601String(),
            'applications_count' => $o->applications_count ?? 0,
            'new_applications_count' => $o->new_applications_count ?? 0,
            'requirements' => $o->relationLoaded('requirements')
                ? $o->requirements->map(fn ($r) => [
                    'id' => $r->id,
                    'name' => $r->name,
                    'description' => $r->description,
                    'is_required' => $r->is_required,
                ])->values()
                : [],
        ];
    }

    private function shapeApplication(JobApplication $a, bool $full = false): array
    {
        $base = [
            'id' => $a->id,
            'name' => $a->full_name,
            'email' => $a->email,
            'phone' => $a->phone,
            'status' => $a->status,
            'rating' => $a->rating,
            'opening' => $a->opening?->title,
            'opening_id' => $a->job_opening_id,
            'documents_count' => $a->documents->count(),
            'created_at' => $a->created_at->toIso8601String(),
        ];

        if ($full) {
            $base['cover_letter'] = $a->cover_letter;
            $base['hr_notes'] = $a->hr_notes;
            $base['reviewed_by'] = $a->reviewer?->name;
            $base['reviewed_at'] = $a->reviewed_at?->toIso8601String();
            $base['documents'] = $a->documents->map(fn ($d) => [
                'id' => $d->id,
                'label' => $d->label,
                'url' => $d->url,
                'original_name' => $d->original_name,
            ])->values();
        }

        return $base;
    }
}
