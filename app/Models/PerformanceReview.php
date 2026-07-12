<?php

namespace App\Models;

use App\Models\Concerns\BelongsToBranch;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PerformanceReview extends Model
{
    use BelongsToBranch;

    /** Rating scale shared by the API and the UI. */
    public const SCALE = [
        1 => 'Needs improvement',
        2 => 'Below expectations',
        3 => 'Meets expectations',
        4 => 'Exceeds expectations',
        5 => 'Outstanding',
    ];

    public const RECOMMENDATIONS = [
        'retain' => 'Retain',
        'promote' => 'Promote',
        'merit_increase' => 'Merit increase',
        'coaching' => 'Coaching',
        'pip' => 'Performance improvement plan',
    ];

    protected $fillable = [
        'employee_id', 'branch_id', 'reviewer_id', 'period_label', 'period_start', 'period_end',
        'status', 'self_appraisal_status', 'self_appraisal_at',
        'overall_rating', 'recommendation', 'strengths', 'improvements',
        'employee_remarks', 'submitted_at', 'acknowledged_at',
    ];

    protected function casts(): array
    {
        return [
            'period_start' => 'date',
            'period_end' => 'date',
            'overall_rating' => 'decimal:2',
            'self_appraisal_at' => 'datetime',
            'submitted_at' => 'datetime',
            'acknowledged_at' => 'datetime',
        ];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewer_id');
    }

    public function goals(): HasMany
    {
        return $this->hasMany(PerformanceGoal::class)->orderBy('sort_order');
    }

    /** The employee's own weighted score, for comparison against the manager's. */
    public function computeSelfOverall(): ?float
    {
        $rated = $this->goals->filter(fn ($g) => $g->self_rating !== null);
        if ($rated->isEmpty()) {
            return null;
        }

        $weight = (int) $rated->sum('weight');
        if ($weight <= 0) {
            return round((float) $rated->avg('self_rating'), 2);
        }

        return round($rated->sum(fn ($g) => $g->self_rating * $g->weight) / $weight, 2);
    }

    /**
     * Weighted score of the rated goals, on the same 1–5 scale.
     *
     * Only rated goals participate, and their weights are renormalised, so a
     * partially-scored review still reads on the 1–5 scale rather than being
     * dragged toward zero by the unrated rows.
     */
    public function computeOverall(): ?float
    {
        $rated = $this->goals->filter(fn ($g) => $g->rating !== null);
        if ($rated->isEmpty()) {
            return null;
        }

        $weight = (int) $rated->sum('weight');
        if ($weight <= 0) {
            return round((float) $rated->avg('rating'), 2);
        }

        return round($rated->sum(fn ($g) => $g->rating * $g->weight) / $weight, 2);
    }
}
