<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Attendance;
use App\Models\Employee;
use App\Models\LeaveRequest;
use App\Models\PerformanceReview;
use App\Models\Payslip;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * Workforce analytics. Every query runs through the branch global scope, so a
 * branch-restricted user sees only their own branches' numbers.
 */
class AnalyticsController extends Controller
{
    private const ACTIVE = ['regular', 'probationary'];

    public function summary(Request $request): JsonResponse
    {
        $months = max(3, min(24, $request->integer('months', 12)));
        $start = now()->subMonths($months - 1)->startOfMonth();

        return response()->json([
            'range' => ['months' => $months, 'from' => $start->toDateString(), 'to' => now()->toDateString()],
            'kpis' => $this->kpis($start),
            'headcount_trend' => $this->headcountTrend($months),
            'headcount_by_branch' => $this->headcountByBranch(),
            'demographics' => $this->demographics(),
            'tenure' => $this->tenure(),
            'punctuality_trend' => $this->punctualityTrend($months),
            'leave_by_type' => $this->leaveByType($start),
            'payroll_trend' => $this->payrollTrend($months),
            'performance_distribution' => $this->performanceDistribution(),
            'leaderboard' => $this->leaderboard(),
        ]);
    }

    /**
     * Branch and department leaderboards, ranked by punctuality this month.
     *
     * Ranking on the *rate* rather than raw counts keeps a 60-person branch
     * comparable with a 6-person one.
     */
    private function leaderboard(): array
    {
        $from = now()->startOfMonth()->toDateString();
        $to = now()->toDateString();

        $rows = Attendance::with('employee:id,branch_id,department_id', 'employee.branch:id,name', 'employee.department:id,name')
            ->whereBetween('work_date', [$from, $to])
            ->get();

        $rank = function (callable $group) use ($rows) {
            return $rows->groupBy($group)
                ->map(function ($days, $name) {
                    $total = $days->count();
                    $late = $days->filter(fn ($a) => $a->late_am_minutes > 0 || $a->late_pm_minutes > 0)->count();

                    return [
                        'name' => $name ?: 'Unassigned',
                        'on_time_rate' => $total > 0 ? round((1 - $late / $total) * 100, 1) : 0,
                        'days' => $total,
                        'late_minutes' => (int) $days->sum(fn ($a) => $a->late_am_minutes + $a->late_pm_minutes),
                        'headcount' => $days->pluck('employee_id')->unique()->count(),
                    ];
                })
                ->reject(fn ($r) => $r['days'] === 0)
                ->sortByDesc('on_time_rate')
                ->values()->all();
        };

        return [
            'period' => now()->format('F Y'),
            'branches' => $rank(fn ($a) => $a->employee?->branch?->name),
            'departments' => $rank(fn ($a) => $a->employee?->department?->name),
        ];
    }

    /** Headline numbers, including turnover over the selected window. */
    private function kpis(Carbon $start): array
    {
        $headcount = Employee::whereIn('status', self::ACTIVE)->count();

        $hires = Employee::where('date_hired', '>=', $start)->count();
        $exits = Employee::withTrashed()
            ->whereNotNull('date_ended')->where('date_ended', '>=', $start)->count();

        // Average headcount over the window, approximated by its endpoints.
        $avgHeadcount = max(1, ($headcount + max(0, $headcount - $hires + $exits)) / 2);

        $monthRows = Attendance::whereBetween('work_date', [now()->startOfMonth()->toDateString(), now()->toDateString()])->get();
        $lateRows = $monthRows->filter(fn ($a) => $a->late_am_minutes > 0 || $a->late_pm_minutes > 0)->count();

        return [
            'headcount' => $headcount,
            'hires' => $hires,
            'exits' => $exits,
            'net_change' => $hires - $exits,
            'turnover_rate' => round($exits / $avgHeadcount * 100, 1),
            'punctuality_rate' => $monthRows->count() > 0
                ? round((1 - $lateRows / $monthRows->count()) * 100, 1)
                : null,
            'avg_tenure_years' => round((float) Employee::whereIn('status', self::ACTIVE)
                ->whereNotNull('date_hired')
                ->get()->avg(fn ($e) => $e->date_hired->diffInDays(now()) / 365.25) ?: 0, 1),
            'pending_reviews' => PerformanceReview::whereIn('status', ['draft', 'submitted'])->count(),
        ];
    }

    /**
     * Headcount at each month-end, reconstructed from hire/exit dates: everyone
     * hired on or before the month end who had not yet left by then.
     */
    private function headcountTrend(int $months): array
    {
        $employees = Employee::withTrashed()->get(['date_hired', 'date_ended']);

        return collect(range($months - 1, 0))->map(function ($back) use ($employees) {
            $end = now()->subMonths($back)->endOfMonth();

            $count = $employees->filter(fn ($e) => $e->date_hired && $e->date_hired->lte($end)
                && (! $e->date_ended || $e->date_ended->gt($end)))->count();

            $hires = $employees->filter(fn ($e) => $e->date_hired && $e->date_hired->isSameMonth($end))->count();
            $exits = $employees->filter(fn ($e) => $e->date_ended && $e->date_ended->isSameMonth($end))->count();

            return [
                'month' => $end->format('M y'),
                'headcount' => $count,
                'hires' => $hires,
                'exits' => $exits,
            ];
        })->values()->all();
    }

    private function headcountByBranch(): array
    {
        return Employee::whereIn('status', self::ACTIVE)
            ->selectRaw('branch_id, count(*) as c')->with('branch:id,name')
            ->groupBy('branch_id')->get()
            ->map(fn ($r) => ['name' => $r->branch?->name ?? 'Unassigned', 'value' => (int) $r->c])
            ->sortByDesc('value')->values()->all();
    }

    /** Gender / employment-type / status splits, shaped for pie + bar charts. */
    private function demographics(): array
    {
        $split = fn (string $column) => Employee::whereIn('status', self::ACTIVE)
            ->selectRaw("$column as k, count(*) as c")->groupBy($column)->get()
            ->map(fn ($r) => [
                'name' => $r->k ? ucfirst(str_replace('_', ' ', $r->k)) : 'Unspecified',
                'value' => (int) $r->c,
            ])->values()->all();

        return [
            'gender' => $split('gender'),
            'employment_type' => $split('employment_type'),
            'status' => Employee::selectRaw('status as k, count(*) as c')->groupBy('status')->get()
                ->map(fn ($r) => ['name' => ucfirst(str_replace('_', ' ', $r->k)), 'value' => (int) $r->c])
                ->values()->all(),
        ];
    }

    private function tenure(): array
    {
        $buckets = [
            '< 1 yr' => 0, '1–2 yrs' => 0, '2–5 yrs' => 0, '5–10 yrs' => 0, '10+ yrs' => 0,
        ];

        Employee::whereIn('status', self::ACTIVE)->whereNotNull('date_hired')->get()
            ->each(function ($e) use (&$buckets) {
                $years = $e->date_hired->diffInDays(now()) / 365.25;

                $key = match (true) {
                    $years < 1 => '< 1 yr',
                    $years < 2 => '1–2 yrs',
                    $years < 5 => '2–5 yrs',
                    $years < 10 => '5–10 yrs',
                    default => '10+ yrs',
                };
                $buckets[$key]++;
            });

        return collect($buckets)->map(fn ($v, $k) => ['name' => $k, 'value' => $v])->values()->all();
    }

    /** Share of attendance rows that were on time, per month. */
    private function punctualityTrend(int $months): array
    {
        $start = now()->subMonths($months - 1)->startOfMonth();

        $rows = Attendance::where('work_date', '>=', $start->toDateString())
            ->get(['work_date', 'late_am_minutes', 'late_pm_minutes', 'undertime_minutes'])
            ->groupBy(fn ($a) => $a->work_date->format('Y-m'));

        return collect(range($months - 1, 0))->map(function ($back) use ($rows) {
            $month = now()->subMonths($back);
            $day = $rows->get($month->format('Y-m'), collect());
            $total = $day->count();
            $late = $day->filter(fn ($a) => $a->late_am_minutes > 0 || $a->late_pm_minutes > 0)->count();

            return [
                'month' => $month->format('M y'),
                'on_time_rate' => $total > 0 ? round((1 - $late / $total) * 100, 1) : 0,
                'late_minutes' => (int) $day->sum(fn ($a) => $a->late_am_minutes + $a->late_pm_minutes),
                'undertime_minutes' => (int) $day->sum('undertime_minutes'),
            ];
        })->values()->all();
    }

    /** Approved leave days taken per leave type over the window. */
    private function leaveByType(Carbon $start): array
    {
        return LeaveRequest::with('type:id,name')
            ->where('status', 'approved')
            ->where('date_from', '>=', $start->toDateString())
            ->selectRaw('leave_type_id, sum(days) as d, count(*) as c')
            ->groupBy('leave_type_id')->get()
            ->map(fn ($r) => [
                'name' => $r->type?->name ?? 'Other',
                'value' => (float) $r->d,
                'requests' => (int) $r->c,
            ])->sortByDesc('value')->values()->all();
    }

    /** Payroll cost per period, oldest first. */
    private function payrollTrend(int $months): array
    {
        $start = now()->subMonths($months - 1)->startOfMonth();

        return Payslip::with('period:id,period_start,period_end,status')
            ->whereHas('period', fn ($q) => $q->where('period_end', '>=', $start->toDateString()))
            ->selectRaw('payroll_period_id, sum(gross_pay) as gross, sum(net_pay) as net, sum(late_deduction) as deductions, count(*) as headcount')
            ->groupBy('payroll_period_id')->get()
            ->sortBy(fn ($r) => $r->period?->period_end)
            ->map(fn ($r) => [
                'label' => $r->period ? $r->period->period_end->format('M j') : '—',
                'gross' => round((float) $r->gross, 2),
                'net' => round((float) $r->net, 2),
                'deductions' => round((float) $r->deductions, 2),
                'headcount' => (int) $r->headcount,
            ])->values()->all();
    }

    /** How the workforce scored, bucketed on the 1–5 scale. */
    private function performanceDistribution(): array
    {
        $scored = PerformanceReview::whereIn('status', ['submitted', 'acknowledged'])
            ->whereNotNull('overall_rating')->get(['overall_rating']);

        return collect(PerformanceReview::SCALE)->map(fn ($label, $value) => [
            'name' => $value . ' · ' . $label,
            'value' => $scored->filter(fn ($r) => (int) round((float) $r->overall_rating) === $value)->count(),
        ])->values()->all();
    }
}
