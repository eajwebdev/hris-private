<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Models\PayrollComponent;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Regression cover for the things that would hurt most if they silently broke:
 * the permission boundary, payroll arithmetic, and the leave approval chain.
 */
class SmokeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);
    }

    private function employeeUser(): User
    {
        return User::where('email', 'employee@eaj.test')->firstOrFail();
    }

    private function adminUser(): User
    {
        return User::where('email', 'admin@eaj.test')->firstOrFail();
    }

    public function test_an_employee_cannot_reach_admin_modules(): void
    {
        Sanctum::actingAs($this->employeeUser());

        foreach ([
            'employees', 'payroll/periods', 'payroll/components', 'analytics',
            'reports', 'users', 'billing', 'settings', 'audit-logs',
            'performance/reviews', 'recruitment/pipeline',
        ] as $route) {
            $this->getJson("/api/v1/{$route}")
                ->assertForbidden();
        }
    }

    public function test_an_employee_can_reach_their_own_ess_data(): void
    {
        Sanctum::actingAs($this->employeeUser());

        foreach ([
            'dashboard/ess', 'leave/my', 'payroll/my', 'performance/my',
            'profile', 'profile/jobs', 'announcements/feed',
        ] as $route) {
            $this->getJson("/api/v1/{$route}")->assertOk();
        }
    }

    public function test_payslip_net_pay_reconciles_with_its_components(): void
    {
        Sanctum::actingAs($this->adminUser());

        $period = $this->postJson('/api/v1/payroll/periods', [
            'period_start' => now()->startOfMonth()->toDateString(),
            'period_end' => now()->toDateString(),
        ])->assertCreated()->json('period');

        $payslips = $this->getJson("/api/v1/payroll/periods/{$period['id']}")
            ->assertOk()->json('payslips');

        $this->assertNotEmpty($payslips, 'payroll produced no payslips');

        foreach ($payslips as $slip) {
            $expected = round(
                max(0, $slip['gross_pay'] + $slip['total_earnings'] - $slip['total_deductions']),
                2
            );

            $this->assertEqualsWithDelta(
                $expected,
                $slip['net_pay'],
                0.01,
                "net pay does not reconcile for payslip {$slip['id']}",
            );

            // Deductions must equal tardiness plus every deduction line.
            $lines = collect($slip['lines'])->where('type', 'deduction')->sum('amount');
            $this->assertEqualsWithDelta(
                round($slip['late_deduction'] + $lines, 2),
                $slip['total_deductions'],
                0.01,
                "deduction total does not match its lines for payslip {$slip['id']}",
            );
        }
    }

    public function test_a_statutory_component_is_applied_to_every_payslip(): void
    {
        Sanctum::actingAs($this->adminUser());

        $sss = PayrollComponent::where('code', 'sss')->firstOrFail();

        $period = $this->postJson('/api/v1/payroll/periods', [
            'period_start' => now()->startOfMonth()->toDateString(),
            'period_end' => now()->toDateString(),
        ])->json('period');

        $payslips = $this->getJson("/api/v1/payroll/periods/{$period['id']}")->json('payslips');

        foreach ($payslips as $slip) {
            $line = collect($slip['lines'])->firstWhere('code', 'sss');
            $this->assertNotNull($line, 'SSS missing from a payslip');

            // 4.5% of the monthly basic, as configured.
            $this->assertEqualsWithDelta(
                round($slip['basic_salary'] * (float) $sss->amount / 100, 2),
                $line['amount'],
                0.01,
            );
        }
    }

    public function test_leave_only_charges_the_balance_on_final_approval(): void
    {
        $employee = Employee::withoutGlobalScopes()
            ->where('user_id', $this->employeeUser()->id)->firstOrFail();

        $type = LeaveType::where('is_active', true)->firstOrFail();

        Sanctum::actingAs($this->employeeUser());

        $filed = $this->postJson('/api/v1/leave/requests', [
            'leave_type_id' => $type->id,
            'date_from' => now()->addWeek()->next('Monday')->toDateString(),
            'date_to' => now()->addWeek()->next('Monday')->toDateString(),
            'half_day' => 'am',
        ])->assertCreated()->json('request');

        // A half-day costs half a day.
        $this->assertSame(0.5, $filed['days']);

        $usedBefore = $this->getJson('/api/v1/leave/my')->json('balances.0.used');

        Sanctum::actingAs($this->adminUser());
        $leave = LeaveRequest::withoutGlobalScopes()->findOrFail($filed['id']);

        // Walk every approval step; the balance must only move on the last one.
        $steps = $leave->approvals()->count();

        for ($i = 1; $i <= $steps; $i++) {
            $this->postJson("/api/v1/leave/requests/{$leave->id}/act", ['action' => 'approve'])
                ->assertOk();
        }

        $leave->refresh();
        $this->assertSame('approved', $leave->status);

        $balance = \App\Models\LeaveBalance::where('employee_id', $employee->id)
            ->where('leave_type_id', $type->id)->where('year', now()->year)->firstOrFail();

        $this->assertEqualsWithDelta(
            (float) $usedBefore + 0.5,
            (float) $balance->used,
            0.01,
            'the half-day was not charged exactly once on final approval',
        );
    }

    public function test_login_is_rate_limited_against_brute_force(): void
    {
        // Six wrong passwords: the first five are rejected, the sixth is locked out.
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/v1/login', [
                'email' => 'admin@eaj.test',
                'password' => 'wrong-password',
            ])->assertStatus(422);
        }

        $this->postJson('/api/v1/login', [
            'email' => 'admin@eaj.test',
            'password' => 'wrong-password',
        ])->assertStatus(429);

        // Even the correct password is refused while the lockout stands.
        $this->postJson('/api/v1/login', [
            'email' => 'admin@eaj.test',
            'password' => 'password',
        ])->assertStatus(429);
    }

    public function test_a_draft_review_hides_the_reviewer_scores_from_the_employee(): void
    {
        $employee = Employee::withoutGlobalScopes()
            ->where('user_id', $this->employeeUser()->id)->firstOrFail();

        Sanctum::actingAs($this->adminUser());

        $review = $this->postJson('/api/v1/performance/reviews', [
            'employee_id' => $employee->id,
            'period_label' => 'Smoke ' . now()->year,
            'period_start' => now()->startOfYear()->toDateString(),
            'period_end' => now()->toDateString(),
            'strengths' => 'Confidential reviewer note.',
            'goals' => [
                ['title' => 'Delivery', 'weight' => 100, 'rating' => 2, 'comments' => 'Confidential.'],
            ],
        ])->assertCreated()->json('review');

        $this->postJson("/api/v1/performance/reviews/{$review['id']}/request-self-appraisal")->assertOk();

        Sanctum::actingAs($this->employeeUser());

        $mine = collect($this->getJson('/api/v1/performance/my')->json('reviews'))
            ->firstWhere('id', $review['id']);

        $this->assertNotNull($mine, 'the employee cannot see the review they must self-appraise');
        $this->assertSame('draft', $mine['status']);

        // The whole point of a self-appraisal: the reviewer's scores stay hidden.
        $this->assertNull($mine['overall_rating']);
        $this->assertNull($mine['strengths']);
        $this->assertNull($mine['goals'][0]['rating']);
        $this->assertNull($mine['goals'][0]['comments']);
    }
}
