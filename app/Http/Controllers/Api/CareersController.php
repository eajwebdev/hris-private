<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Models\JobApplication;
use App\Models\JobOpening;
use App\Models\User;
use App\Services\Notifier;
use App\Support\PrivateFile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

/** Public careers portal — no authentication. */
class CareersController extends Controller
{
    /**
     * The tenant this careers portal belongs to.
     *
     * The portal is unauthenticated, so there is no user to infer a tenant from, and the
     * app has no host/subdomain tenant routing. `Company::first()` therefore silently
     * published whichever company happened to sort first — wrong the moment a second one
     * exists. Pin it explicitly with HRIS_COMPANY_ID; with a single company (the norm for
     * one deployment) it resolves on its own.
     */
    private function company(): ?Company
    {
        $pinned = config('hris.company_id');

        if ($pinned) {
            return Company::find($pinned);
        }

        // Refuse to guess rather than expose the wrong tenant's openings.
        return Company::query()->count() === 1
            ? Company::query()->first()
            : null;
    }

    /**
     * A published opening on THIS portal's company. Scoped to the tenant so a slug
     * collision between two companies can never surface the wrong one's vacancy.
     */
    private function publishedOpening(string $slug, array $with = []): JobOpening
    {
        $company = $this->company();
        abort_unless($company, 404);

        return JobOpening::with($with)
            ->where('company_id', $company->id)
            ->where('slug', $slug)
            ->where('status', 'open')
            ->whereNotNull('published_at')
            ->firstOrFail();
    }

    /** List published, open positions. */
    public function index(): JsonResponse
    {
        $company = $this->company();
        if (! $company) {
            return response()->json(['company' => null, 'data' => []]);
        }

        $openings = JobOpening::with('branch:id,name')
            ->withCount('requirements')
            ->where('company_id', $company->id)
            ->where('status', 'open')
            ->whereNotNull('published_at')
            ->orderByDesc('published_at')
            ->get()->map(fn ($o) => $this->shape($o));

        return response()->json([
            'company' => ['name' => $company->name],
            'data' => $openings,
        ]);
    }

    /** A single opening with its required-documents checklist. */
    public function show(string $slug): JsonResponse
    {
        $opening = $this->publishedOpening($slug, with: ['branch:id,name', 'requirements']);

        return response()->json(['opening' => $this->shape($opening, detail: true)]);
    }

    /** Submit an application with attached documents. */
    public function apply(Request $request, string $slug): JsonResponse
    {
        $opening = $this->publishedOpening($slug, with: ['requirements']);

        $validator = Validator::make($request->all(), [
            'first_name' => ['required', 'string', 'max:80'],
            'last_name' => ['required', 'string', 'max:80'],
            'email' => ['required', 'email', 'max:150'],
            'phone' => ['nullable', 'string', 'max:40'],
            'cover_letter' => ['nullable', 'string', 'max:5000'],
        ]);

        // Every *required* document must be attached, and anything attached must be a real
        // file of an allowed type. The type rules are attached unconditionally rather than
        // only when hasFile() — otherwise sending `documents[3]=hello` as a plain string
        // satisfied `required` and skipped the file checks entirely.
        $fileRules = ['file', 'mimes:pdf,doc,docx,jpg,jpeg,png', 'max:5120'];

        foreach ($opening->requirements as $req) {
            $field = "documents.{$req->id}";
            $validator->addRules([
                $field => $req->is_required ? array_merge(['required'], $fileRules) : array_merge(['nullable'], $fileRules),
            ]);
        }

        $validator->setCustomMessages([
            'documents.*.required' => 'This document is required.',
            'documents.*.mimes' => 'Allowed types: PDF, DOC, DOCX, JPG, PNG.',
            'documents.*.max' => 'Each file must be 5MB or smaller.',
        ]);

        $data = $validator->validate();

        // Guard against duplicate applications from the same email.
        $dupe = JobApplication::where('job_opening_id', $opening->id)
            ->where('email', $data['email'])->exists();
        if ($dupe) {
            return response()->json(['message' => 'You have already applied for this position.'], 422);
        }

        $application = JobApplication::create([
            'job_opening_id' => $opening->id,
            'first_name' => $data['first_name'],
            'last_name' => $data['last_name'],
            'email' => $data['email'],
            'phone' => $data['phone'] ?? null,
            'cover_letter' => $data['cover_letter'] ?? null,
        ]);

        foreach ($opening->requirements as $req) {
            $file = $request->file("documents.{$req->id}");
            if ($file) {
                // Applicant CVs and government IDs. This is an UNAUTHENTICATED upload —
                // it must never land anywhere the web server will serve directly.
                $path = $file->store("recruitment/{$opening->id}/{$application->id}", PrivateFile::DISK);
                $application->documents()->create([
                    'job_opening_requirement_id' => $req->id,
                    'label' => $req->name,
                    'file_path' => $path,
                    'original_name' => $file->getClientOriginalName(),
                ]);
            }
        }

        $this->notifyRecruiters($opening, $application);

        return response()->json(['message' => 'Application submitted! Our HR team will be in touch.'], 201);
    }

    private function notifyRecruiters(JobOpening $opening, JobApplication $application): void
    {
        $recipients = User::where('company_id', $opening->company_id)
            ->where('is_active', true)
            ->where(fn ($q) => $q->where('is_super_admin', true)->orWhere('id', $opening->created_by))
            ->pluck('id');

        Notifier::toUsers($recipients, [
            'type' => 'recruitment',
            'title' => 'New application: ' . $opening->title,
            'body' => $application->full_name . ' applied' . ($application->email ? ' · ' . $application->email : ''),
            'link' => '/app/recruitment',
            'icon' => 'briefcase',
        ]);
    }

    private function shape(JobOpening $o, bool $detail = false): array
    {
        $base = [
            'id' => $o->id,
            'title' => $o->title,
            'slug' => $o->slug,
            'branch' => $o->branch?->name,
            'department' => $o->department,
            'employment_type' => $o->employment_type,
            'location' => $o->location,
            'salary_range' => $o->salary_range,
            'openings_count' => $o->openings_count,
            'published_at' => $o->published_at?->toIso8601String(),
        ];

        if ($detail) {
            $base['description'] = $o->description;
            $base['requirements'] = $o->requirements->map(fn ($r) => [
                'id' => $r->id,
                'name' => $r->name,
                'description' => $r->description,
                'is_required' => $r->is_required,
            ])->values();
        } else {
            $base['requirements_count'] = $o->requirements_count ?? 0;
        }

        return $base;
    }
}
