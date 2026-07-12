<?php

namespace Tests\Feature;

use App\Models\AppNotification;
use App\Models\Invoice;
use App\Models\User;
use App\Services\SubscriptionStatus;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The role split that pays for this system:
 *  - HR Admin runs employee payroll and may only *look* at the subscription bill.
 *  - SuperAdmin (owner/developer) sets the due date and records payment.
 *  - Falling behind on payment warns, escalates, and never locks anyone out.
 */
class SubscriptionBillingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);

        // The seeder ships a demo invoice history. Standing is driven by the *oldest*
        // unpaid invoice, so clear it out — otherwise a seeded bill, not the one under
        // test, decides the stage.
        Invoice::query()->delete();
    }

    private function hrUser(): User
    {
        return User::where('email', 'hr@eaj.test')->firstOrFail();
    }

    private function ownerUser(): User
    {
        return User::where('email', 'admin@eaj.test')->firstOrFail();
    }

    private function invoiceDue(int $daysFromToday, string $status = 'unpaid'): Invoice
    {
        return Invoice::create([
            'company_id' => $this->hrUser()->company_id,
            'number' => Invoice::nextNumber($this->hrUser()->company_id),
            'description' => 'Subscription',
            'amount' => 5000,
            'currency' => 'PHP',
            'status' => $status,
            'issued_at' => now()->subDays(15)->toDateString(),
            'due_at' => now()->addDays($daysFromToday)->toDateString(),
        ]);
    }

    public function test_hr_admin_can_run_employee_payroll(): void
    {
        Sanctum::actingAs($this->hrUser());

        $period = $this->postJson('/api/v1/payroll/periods', [
            'period_start' => now()->startOfMonth()->toDateString(),
            'period_end' => now()->toDateString(),
        ])->assertCreated()->json('period');

        // Finalizing needs payroll.approve — HR owns that too.
        $this->postJson("/api/v1/payroll/periods/{$period['id']}/finalize")->assertOk();
    }

    public function test_hr_admin_can_view_the_bill_but_not_pay_it(): void
    {
        $invoice = $this->invoiceDue(3);
        Sanctum::actingAs($this->hrUser());

        $this->getJson('/api/v1/billing')->assertOk();
        $this->getJson('/api/v1/billing/notice')->assertOk();

        // Owner-only writes.
        $this->postJson("/api/v1/billing/invoices/{$invoice->id}/pay")->assertForbidden();
        $this->putJson('/api/v1/billing/plan', [
            'plan_name' => 'Free Forever',
            'rate_per_employee' => 0,
            'billing_cycle' => 'monthly',
        ])->assertForbidden();
        $this->postJson('/api/v1/billing/generate-invoice')->assertForbidden();
        $this->deleteJson("/api/v1/billing/invoices/{$invoice->id}")->assertForbidden();

        $this->assertSame('unpaid', $invoice->fresh()->status);
    }

    public function test_the_owner_sets_the_due_date_and_marks_it_paid(): void
    {
        $invoice = $this->invoiceDue(3);
        Sanctum::actingAs($this->ownerUser());

        $this->putJson('/api/v1/billing/plan', [
            'plan_name' => 'Per-Employee',
            'rate_per_employee' => 50,
            'billing_cycle' => 'monthly',
            'next_billing_at' => now()->addMonth()->toDateString(),
        ])->assertOk();

        $this->postJson("/api/v1/billing/invoices/{$invoice->id}/pay")->assertOk();

        $this->assertSame('paid', $invoice->fresh()->status);
    }

    /** @return array<string, array{int, string}> */
    public static function dueDateStages(): array
    {
        return [
            'well before due'       => [30, SubscriptionStatus::OK],
            'reminder window opens' => [5, SubscriptionStatus::DUE_SOON],
            'due today'             => [0, SubscriptionStatus::DUE_TODAY],
            'first day of grace'    => [-1, SubscriptionStatus::GRACE],
            'last day of grace'     => [-5, SubscriptionStatus::GRACE],
            'grace exhausted'       => [-6, SubscriptionStatus::DELINQUENT],
        ];
    }

    /** @dataProvider dueDateStages */
    public function test_payment_standing_escalates_with_the_due_date(int $days, string $expected): void
    {
        $this->invoiceDue($days);

        $this->assertSame($expected, SubscriptionStatus::for($this->hrUser()->company_id)['stage']);
    }

    public function test_a_paid_invoice_leaves_the_tenant_in_the_clear(): void
    {
        $this->invoiceDue(-20, 'paid');

        $this->assertSame(SubscriptionStatus::OK, SubscriptionStatus::for($this->hrUser()->company_id)['stage']);
    }

    public function test_reminders_reach_hr_and_the_owner_but_never_the_rank_and_file(): void
    {
        $this->invoiceDue(5); // Exactly the 5-day heads-up.

        $this->artisan('billing:remind')->assertSuccessful();

        $notified = AppNotification::where('type', 'billing')->pluck('user_id');

        $this->assertTrue($notified->contains($this->hrUser()->id), 'HR Admin was not warned.');
        $this->assertTrue($notified->contains($this->ownerUser()->id), 'Owner was not warned.');
        $this->assertFalse(
            $notified->contains(User::where('email', 'employee@eaj.test')->firstOrFail()->id),
            'A rank-and-file employee was warned about the subscription bill.'
        );
    }

    public function test_rerunning_the_reminder_does_not_double_notify(): void
    {
        $this->invoiceDue(5);

        $this->artisan('billing:remind')->assertSuccessful();
        $before = AppNotification::where('type', 'billing')->count();

        $this->artisan('billing:remind')->assertSuccessful();

        $this->assertSame($before, AppNotification::where('type', 'billing')->count());
    }

    public function test_an_unpaid_bill_never_locks_hr_out_of_the_hris(): void
    {
        $this->invoiceDue(-90); // Long past the grace period.
        Sanctum::actingAs($this->hrUser());

        $this->getJson('/api/v1/billing/notice')
            ->assertOk()
            ->assertJsonPath('stage', SubscriptionStatus::DELINQUENT)
            ->assertJsonPath('restricts_access', false);

        // The HRIS keeps working — warnings only.
        $this->getJson('/api/v1/employees')->assertOk();
        $this->postJson('/api/v1/payroll/periods', [
            'period_start' => now()->startOfMonth()->toDateString(),
            'period_end' => now()->toDateString(),
        ])->assertCreated();
    }
}
