<?php

namespace Database\Seeders;

use App\Models\Employee;
use App\Models\PerformanceReview;
use App\Models\User;
use Illuminate\Database\Seeder;

class PerformanceSeeder extends Seeder
{
    /** The criteria every seeded review is scored against — weights sum to 100. */
    private const CRITERIA = [
        ['title' => 'Quality of work', 'weight' => 30, 'description' => 'Accuracy, thoroughness and consistency of output.'],
        ['title' => 'Productivity', 'weight' => 25, 'description' => 'Volume of work delivered against expectations.'],
        ['title' => 'Reliability & attendance', 'weight' => 20, 'description' => 'Punctuality and dependability.'],
        ['title' => 'Collaboration', 'weight' => 15, 'description' => 'Works well across the team.'],
        ['title' => 'Initiative', 'weight' => 10, 'description' => 'Takes ownership beyond the brief.'],
    ];

    public function run(): void
    {
        $reviewer = User::where('email', 'hr@eaj.test')->first()
            ?? User::where('is_super_admin', true)->first();

        // Two closed periods plus an in-flight one, so the list shows every status.
        $periods = [
            ['label' => 'H1 ' . (now()->year - 1), 'start' => now()->subYear()->startOfYear(), 'end' => now()->subYear()->startOfYear()->addMonths(6)->endOfMonth(), 'status' => 'acknowledged'],
            ['label' => 'H2 ' . (now()->year - 1), 'start' => now()->subYear()->startOfYear()->addMonths(6), 'end' => now()->subYear()->endOfYear(), 'status' => 'submitted'],
            ['label' => 'H1 ' . now()->year, 'start' => now()->startOfYear(), 'end' => now()->startOfYear()->addMonths(6)->endOfMonth(), 'status' => 'draft'],
        ];

        $employees = Employee::withoutGlobalScopes()->whereIn('status', ['regular', 'probationary'])->get();
        if ($employees->isEmpty()) {
            $this->command?->warn('PerformanceSeeder: no employees to review.');

            return;
        }

        // Review roughly two-thirds of the workforce — a real cycle is never complete.
        foreach ($employees as $i => $employee) {
            if ($i % 3 === 2) {
                continue;
            }

            foreach ($periods as $p) {
                // Skip anyone hired after the period closed.
                if ($employee->date_hired && $employee->date_hired->gt($p['end'])) {
                    continue;
                }

                $review = PerformanceReview::withoutGlobalScopes()->firstOrNew([
                    'employee_id' => $employee->id,
                    'period_label' => $p['label'],
                ]);

                if ($review->exists) {
                    continue;
                }

                $isDraft = $p['status'] === 'draft';

                $review->fill([
                    'branch_id' => $employee->branch_id,
                    'reviewer_id' => $reviewer?->id,
                    'period_start' => $p['start']->toDateString(),
                    'period_end' => $p['end']->toDateString(),
                    'status' => $p['status'],
                    'strengths' => 'Dependable, communicates clearly, and is trusted with client-facing work.',
                    'improvements' => 'Could delegate more and document decisions earlier in the cycle.',
                    'recommendation' => ['retain', 'promote', 'merit_increase', 'coaching'][$i % 4],
                    'submitted_at' => $isDraft ? null : $p['end']->copy()->addDays(7),
                    'acknowledged_at' => $p['status'] === 'acknowledged' ? $p['end']->copy()->addDays(10) : null,
                    'employee_remarks' => $p['status'] === 'acknowledged' ? 'Thank you — the feedback is fair and I’ll act on it.' : null,
                ])->save();

                foreach (self::CRITERIA as $order => $c) {
                    // Drafts are only partly scored; closed reviews are fully rated.
                    $rating = $isDraft && $order > 1 ? null : max(1, min(5, 3 + (($i + $order) % 3) - ($order % 2)));

                    $review->goals()->create([
                        'title' => $c['title'],
                        'description' => $c['description'],
                        'weight' => $c['weight'],
                        'rating' => $rating,
                        'comments' => $rating ? 'Scored against the agreed targets for the period.' : null,
                        'sort_order' => $order,
                    ]);
                }

                if (! $isDraft) {
                    $review->update(['overall_rating' => $review->load('goals')->computeOverall()]);
                }
            }
        }

        $this->command?->info('Seeded performance reviews across ' . $employees->count() . ' employees.');
    }
}
