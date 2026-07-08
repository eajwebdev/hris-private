<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Models\JobApplication;
use App\Models\JobOpening;
use App\Models\User;
use App\Services\Notifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

/** Public careers portal — no authentication. */
class CareersController extends Controller
{
    private function company(): ?Company
    {
        return Company::query()->first();
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
        $opening = JobOpening::with('branch:id,name', 'requirements')
            ->where('slug', $slug)->where('status', 'open')->whereNotNull('published_at')
            ->firstOrFail();

        return response()->json(['opening' => $this->shape($opening, detail: true)]);
    }

    /** Submit an application with attached documents. */
    public function apply(Request $request, string $slug): JsonResponse
    {
        $opening = JobOpening::with('requirements')
            ->where('slug', $slug)->where('status', 'open')->whereNotNull('published_at')
            ->firstOrFail();

        $validator = Validator::make($request->all(), [
            'first_name' => ['required', 'string', 'max:80'],
            'last_name' => ['required', 'string', 'max:80'],
            'email' => ['required', 'email', 'max:150'],
            'phone' => ['nullable', 'string', 'max:40'],
            'cover_letter' => ['nullable', 'string', 'max:5000'],
        ]);

        // Every *required* document must be attached; validate each file.
        foreach ($opening->requirements as $req) {
            $field = "documents.{$req->id}";
            if ($req->is_required) {
                $validator->sometimes($field, ['required'], fn () => true);
            }
            $validator->sometimes($field, ['file', 'mimes:pdf,doc,docx,jpg,jpeg,png', 'max:5120'], fn () => $request->hasFile($field));
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
                $path = $file->store("recruitment/{$opening->id}/{$application->id}", 'public');
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
