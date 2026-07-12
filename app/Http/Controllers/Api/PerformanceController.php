<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Auditor;
use App\Models\Employee;
use App\Models\PerformanceReview;
use App\Services\Notifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class PerformanceController extends Controller
{
    private function currentEmployee(Request $request): Employee
    {
        $employee = Employee::withoutGlobalScopes()->where('user_id', $request->user()->id)->first();
        abort_unless($employee, 422, 'Your login isn’t linked to an employee record. Ask HR to connect it.');

        return $employee;
    }

    /** Rating scale + recommendation list, so the UI never hardcodes them. */
    public function meta(): JsonResponse
    {
        return response()->json([
            'scale' => collect(PerformanceReview::SCALE)->map(fn ($label, $value) => [
                'value' => $value,
                'label' => $label,
            ])->values(),
            'recommendations' => collect(PerformanceReview::RECOMMENDATIONS)
                ->map(fn ($label, $value) => ['value' => $value, 'label' => $label])->values(),
        ]);
    }

    // -------------------------------------------------------------- Admin

    public function index(Request $request)
    {
        $q = PerformanceReview::with('employee:id,first_name,last_name,photo_path,department_id', 'employee.position:id,title', 'reviewer:id,name')
            ->when($request->filled('status'), fn ($w) => $w->where('status', $request->string('status')))
            ->when($request->filled('branch_id'), fn ($w) => $w->where('branch_id', $request->integer('branch_id')))
            ->when($request->filled('employee_id'), fn ($w) => $w->where('employee_id', $request->integer('employee_id')))
            ->when($request->filled('period'), fn ($w) => $w->where('period_label', $request->string('period')))
            ->orderByRaw("case when status = 'draft' then 0 when status = 'submitted' then 1 else 2 end")
            ->orderByDesc('period_end');

        $page = $q->paginate($request->integer('per_page', 15));
        $page->getCollection()->transform(fn ($r) => $this->shape($r, admin: true));

        return $page;
    }

    public function show(PerformanceReview $review): JsonResponse
    {
        $review->load('employee:id,first_name,last_name,photo_path', 'employee.position:id,title', 'reviewer:id,name', 'goals');

        return response()->json(['review' => $this->shape($review, admin: true, detail: true)]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validateReview($request);

        $employee = Employee::withoutGlobalScopes()->findOrFail($data['employee_id']);

        $exists = PerformanceReview::withoutGlobalScopes()
            ->where('employee_id', $employee->id)->where('period_label', $data['period_label'])->exists();
        if ($exists) {
            return response()->json(['message' => "{$employee->full_name} already has a review for {$data['period_label']}."], 422);
        }

        $review = DB::transaction(function () use ($data, $employee, $request) {
            $review = PerformanceReview::create([
                'employee_id' => $employee->id,
                'branch_id' => $employee->branch_id,
                'reviewer_id' => $request->user()->id,
                'period_label' => $data['period_label'],
                'period_start' => $data['period_start'],
                'period_end' => $data['period_end'],
                'recommendation' => $data['recommendation'] ?? null,
                'strengths' => $data['strengths'] ?? null,
                'improvements' => $data['improvements'] ?? null,
            ]);

            $this->syncGoals($review, $data['goals']);

            return $review;
        });

        return response()->json([
            'message' => "Review created for {$employee->full_name}.",
            'review' => $this->shape($review->fresh()->load('employee.position', 'reviewer', 'goals'), admin: true, detail: true),
        ], 201);
    }

    /** Edit a review's criteria, ratings and narrative. Locked once acknowledged. */
    public function update(Request $request, PerformanceReview $review): JsonResponse
    {
        if ($review->status === 'acknowledged') {
            return response()->json(['message' => 'This review was acknowledged by the employee and can no longer be edited.'], 422);
        }

        $data = $this->validateReview($request, updating: true);

        DB::transaction(function () use ($review, $data) {
            $review->update([
                'period_label' => $data['period_label'],
                'period_start' => $data['period_start'],
                'period_end' => $data['period_end'],
                'recommendation' => $data['recommendation'] ?? null,
                'strengths' => $data['strengths'] ?? null,
                'improvements' => $data['improvements'] ?? null,
            ]);

            $this->syncGoals($review, $data['goals']);

            // Keep the rolled-up score in step with the edited ratings.
            $review->update(['overall_rating' => $review->load('goals')->computeOverall()]);
        });

        return response()->json([
            'message' => 'Review saved.',
            'review' => $this->shape($review->fresh()->load('employee.position', 'reviewer', 'goals'), admin: true, detail: true),
        ]);
    }

    /** Release the review to the employee. Every criterion must be rated first. */
    public function submit(Request $request, PerformanceReview $review): JsonResponse
    {
        if ($review->status !== 'draft') {
            return response()->json(['message' => 'This review was already ' . $review->status . '.'], 422);
        }

        $review->load('goals');

        if ($review->goals->isEmpty()) {
            return response()->json(['message' => 'Add at least one criterion before submitting.'], 422);
        }
        if ($review->goals->contains(fn ($g) => $g->rating === null)) {
            return response()->json(['message' => 'Rate every criterion before submitting this review.'], 422);
        }

        $review->update([
            'status' => 'submitted',
            'overall_rating' => $review->computeOverall(),
            'reviewer_id' => $review->reviewer_id ?? $request->user()->id,
            'submitted_at' => now(),
        ]);

        $employee = Employee::withoutGlobalScopes()->find($review->employee_id);
        if ($employee?->user_id) {
            Notifier::toUser($employee->user_id, [
                'type' => 'performance',
                'title' => "Your {$review->period_label} performance review is ready",
                'body' => 'Review the results and acknowledge them.',
                'link' => '/ess/performance',
                'icon' => 'target',
            ]);
        }

        Auditor::record(
            'performance',
            'submitted',
            "Released the {$review->period_label} review for " . ($employee?->full_name ?? 'employee')
                . " (overall {$review->overall_rating}).",
            $review,
            null,
            $review->branch_id,
        );

        return response()->json([
            'message' => 'Review submitted — the employee has been notified.',
            'review' => $this->shape($review->fresh()->load('employee.position', 'reviewer', 'goals'), admin: true, detail: true),
        ]);
    }

    public function destroy(PerformanceReview $review): JsonResponse
    {
        if ($review->status === 'acknowledged') {
            return response()->json(['message' => 'Acknowledged reviews are part of the employee record and cannot be deleted.'], 422);
        }

        $review->delete();

        return response()->json(['message' => 'Review deleted.']);
    }

    /** Ask the employee to score themselves before HR finalises the review. */
    public function requestSelfAppraisal(Request $request, PerformanceReview $review): JsonResponse
    {
        if ($review->status !== 'draft') {
            return response()->json(['message' => 'Self-appraisal can only be requested while the review is a draft.'], 422);
        }
        if ($review->self_appraisal_status !== 'none') {
            return response()->json(['message' => 'A self-appraisal has already been requested.'], 422);
        }

        $review->update(['self_appraisal_status' => 'pending']);

        $employee = Employee::withoutGlobalScopes()->find($review->employee_id);
        if ($employee?->user_id) {
            Notifier::toUser($employee->user_id, [
                'type' => 'performance',
                'title' => "Self-appraisal requested for {$review->period_label}",
                'body' => 'Score yourself against the criteria before your reviewer finalises the review.',
                'link' => '/ess/performance',
                'icon' => 'target',
            ]);
        }

        Auditor::record(
            'performance',
            'submitted',
            'Requested a self-appraisal from ' . ($employee?->full_name ?? 'employee') . " for {$review->period_label}.",
            $review, null, $review->branch_id,
        );

        return response()->json([
            'message' => 'Self-appraisal requested — the employee has been notified.',
            'review' => $this->shape($review->fresh()->load('employee.position', 'reviewer', 'goals'), admin: true, detail: true),
        ]);
    }

    // ---------------------------------------------------------------- ESS

    /** The employee's own reviews — drafts stay hidden until submitted. */
    public function my(Request $request): JsonResponse
    {
        $employee = $this->currentEmployee($request);

        // Released reviews, plus any still-draft review the employee has been asked
        // to self-appraise. shape() redacts the reviewer's scores on drafts.
        $reviews = PerformanceReview::withoutGlobalScopes()
            ->with('reviewer:id,name', 'goals')
            ->where('employee_id', $employee->id)
            ->where(fn ($q) => $q
                ->whereIn('status', ['submitted', 'acknowledged'])
                ->orWhere(fn ($w) => $w->where('status', 'draft')->where('self_appraisal_status', '!=', 'none')))
            ->orderByDesc('period_end')
            ->get()->map(fn ($r) => $this->shape($r, detail: true));

        $released = $reviews->where('status', '!=', 'draft');

        return response()->json([
            'reviews' => $reviews,
            'latest_rating' => $released->first()['overall_rating'] ?? null,
            'pending_acknowledgement' => $reviews->where('status', 'submitted')->count(),
            'pending_self_appraisal' => $reviews->where('self_appraisal_status', 'pending')->count(),
        ]);
    }

    /** The employee's own scores against the same criteria. */
    public function selfAppraise(Request $request, int $id): JsonResponse
    {
        $employee = $this->currentEmployee($request);

        $data = $request->validate([
            'goals' => ['required', 'array', 'min:1'],
            'goals.*.id' => ['required', 'integer'],
            'goals.*.self_rating' => ['required', 'integer', 'min:1', 'max:5'],
            'goals.*.self_comments' => ['nullable', 'string', 'max:1000'],
        ]);

        $review = PerformanceReview::withoutGlobalScopes()->with('goals')
            ->where('employee_id', $employee->id)
            ->where('self_appraisal_status', 'pending')
            ->findOrFail($id);

        $goals = $review->goals->keyBy('id');

        DB::transaction(function () use ($data, $goals, $review) {
            foreach ($data['goals'] as $row) {
                $goal = $goals->get($row['id']);
                // Ignore anything that isn't a criterion on this review.
                if (! $goal) {
                    continue;
                }

                $goal->update([
                    'self_rating' => $row['self_rating'],
                    'self_comments' => $row['self_comments'] ?? null,
                ]);
            }

            $review->update([
                'self_appraisal_status' => 'done',
                'self_appraisal_at' => now(),
            ]);
        });

        if ($review->reviewer_id) {
            Notifier::toUser($review->reviewer_id, [
                'type' => 'performance',
                'title' => $employee->full_name . ' completed their self-appraisal',
                'body' => $review->period_label,
                'link' => '/app/performance',
                'icon' => 'target',
            ]);
        }

        return response()->json(['message' => 'Self-appraisal submitted — thank you.']);
    }

    public function acknowledge(Request $request, int $id): JsonResponse
    {
        $employee = $this->currentEmployee($request);

        $data = $request->validate([
            'employee_remarks' => ['nullable', 'string', 'max:2000'],
        ]);

        $review = PerformanceReview::withoutGlobalScopes()
            ->where('employee_id', $employee->id)->where('status', 'submitted')->findOrFail($id);

        $review->update([
            'status' => 'acknowledged',
            'employee_remarks' => $data['employee_remarks'] ?? null,
            'acknowledged_at' => now(),
        ]);

        if ($review->reviewer_id) {
            Notifier::toUser($review->reviewer_id, [
                'type' => 'performance',
                'title' => $employee->full_name . ' acknowledged their review',
                'body' => $review->period_label,
                'link' => '/app/performance',
                'icon' => 'target',
            ]);
        }

        return response()->json(['message' => 'Review acknowledged.']);
    }

    // ------------------------------------------------------------ Internals

    private function validateReview(Request $request, bool $updating = false): array
    {
        $rules = [
            'period_label' => ['required', 'string', 'max:60'],
            'period_start' => ['required', 'date'],
            'period_end' => ['required', 'date', 'after_or_equal:period_start'],
            'recommendation' => ['nullable', 'in:' . implode(',', array_keys(PerformanceReview::RECOMMENDATIONS))],
            'strengths' => ['nullable', 'string', 'max:2000'],
            'improvements' => ['nullable', 'string', 'max:2000'],
            'goals' => ['required', 'array', 'min:1'],
            'goals.*.title' => ['required', 'string', 'max:150'],
            'goals.*.description' => ['nullable', 'string', 'max:1000'],
            'goals.*.weight' => ['required', 'integer', 'min:0', 'max:100'],
            'goals.*.rating' => ['nullable', 'integer', 'min:1', 'max:5'],
            'goals.*.comments' => ['nullable', 'string', 'max:1000'],
        ];

        if (! $updating) {
            $rules['employee_id'] = ['required', 'exists:employees,id'];
        }

        $data = $request->validate($rules);

        // Weights are a percentage split of the overall score.
        $total = (int) collect($data['goals'])->sum('weight');
        if ($total !== 100) {
            throw ValidationException::withMessages([
                'goals' => "Criteria weights must add up to 100% (currently {$total}%).",
            ]);
        }

        return $data;
    }

    /**
     * Rewrite the criteria. Goals are replaced wholesale, so any self-appraisal
     * already given is carried across by title — otherwise an HR edit would
     * silently wipe the employee's own scores.
     */
    private function syncGoals(PerformanceReview $review, array $goals): void
    {
        $self = $review->goals()->get()
            ->filter(fn ($g) => $g->self_rating !== null || $g->self_comments)
            ->keyBy(fn ($g) => mb_strtolower(trim($g->title)));

        $review->goals()->delete();

        foreach (array_values($goals) as $i => $g) {
            $previous = $self->get(mb_strtolower(trim($g['title'])));

            $review->goals()->create([
                'title' => $g['title'],
                'description' => $g['description'] ?? null,
                'weight' => $g['weight'],
                'rating' => $g['rating'] ?? null,
                'comments' => $g['comments'] ?? null,
                'self_rating' => $previous?->self_rating,
                'self_comments' => $previous?->self_comments,
                'sort_order' => $i,
            ]);
        }
    }

    private function shape(PerformanceReview $r, bool $admin = false, bool $detail = false): array
    {
        // An employee self-appraising a draft must not see how their reviewer has
        // scored them so far — that would defeat the point of a self-appraisal.
        $hideReviewerScores = ! $admin && $r->status === 'draft';

        $base = [
            'id' => $r->id,
            'period_label' => $r->period_label,
            'period_start' => $r->period_start->toDateString(),
            'period_end' => $r->period_end->toDateString(),
            'status' => $r->status,
            'self_appraisal_status' => $r->self_appraisal_status,
            'self_appraisal_at' => $r->self_appraisal_at?->toIso8601String(),
            'overall_rating' => ! $hideReviewerScores && $r->overall_rating !== null ? (float) $r->overall_rating : null,
            'rating_label' => ! $hideReviewerScores && $r->overall_rating !== null
                ? (PerformanceReview::SCALE[(int) round((float) $r->overall_rating)] ?? null)
                : null,
            'recommendation' => $hideReviewerScores ? null : $r->recommendation,
            'recommendation_label' => ! $hideReviewerScores && $r->recommendation
                ? (PerformanceReview::RECOMMENDATIONS[$r->recommendation] ?? null)
                : null,
            'reviewer' => $r->reviewer?->name,
            'submitted_at' => $r->submitted_at?->toIso8601String(),
            'acknowledged_at' => $r->acknowledged_at?->toIso8601String(),
        ];

        if ($admin) {
            $base['employee'] = $r->employee ? [
                'id' => $r->employee->id,
                'name' => $r->employee->full_name,
                'position' => $r->employee->position?->title,
                'photo_url' => $r->employee->photo_path ? asset('storage/' . $r->employee->photo_path) : null,
            ] : null;
        }

        if ($detail) {
            $base['strengths'] = $hideReviewerScores ? null : $r->strengths;
            $base['improvements'] = $hideReviewerScores ? null : $r->improvements;
            $base['employee_remarks'] = $r->employee_remarks;
            $base['self_overall'] = $r->computeSelfOverall();
            $base['goals'] = $r->goals->map(fn ($g) => [
                'id' => $g->id,
                'title' => $g->title,
                'description' => $g->description,
                'weight' => $g->weight,
                'rating' => $hideReviewerScores ? null : $g->rating,
                'rating_label' => ! $hideReviewerScores && $g->rating ? (PerformanceReview::SCALE[$g->rating] ?? null) : null,
                'comments' => $hideReviewerScores ? null : $g->comments,
                'self_rating' => $g->self_rating,
                'self_rating_label' => $g->self_rating ? (PerformanceReview::SCALE[$g->self_rating] ?? null) : null,
                'self_comments' => $g->self_comments,
            ])->values();
        }

        return $base;
    }
}
