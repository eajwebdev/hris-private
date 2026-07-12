<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Auditor;
use App\Models\Branch;
use App\Models\Employee;
use App\Models\Invoice;
use App\Models\Setting;
use App\Models\User;
use App\Services\Notifier;
use App\Services\SubscriptionStatus;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The tenant's subscription to this system — NOT employee payroll (see PayrollController).
 *
 * HR Admin gets read-only access so they can see what's owed and by when. Only the
 * SuperAdmin (system owner) sets the plan/due date, issues invoices, and records
 * payment; those routes carry the `superadmin` middleware.
 */
class BillingController extends Controller
{
    /** Current plan, usage snapshot, invoice history, and payment standing. */
    public function index(Request $request): JsonResponse
    {
        $companyId = $request->user()->company_id;

        $invoices = Invoice::where('company_id', $companyId)
            ->orderByDesc('issued_at')->orderByDesc('id')
            ->get()->map(fn ($i) => $this->shape($i));

        return response()->json([
            'plan' => $this->plan($companyId),
            'usage' => [
                'active_users' => User::where('company_id', $companyId)->where('is_active', true)->count(),
                'employees' => $this->billableEmployees($companyId),
                'branches' => Branch::where('company_id', $companyId)->count(),
            ],
            'invoices' => $invoices,
            'outstanding' => (float) Invoice::where('company_id', $companyId)->whereIn('status', ['unpaid', 'overdue'])->sum('amount'),
            'status' => $this->notice($request)->getData(true),
        ]);
    }

    /**
     * Lightweight payment standing for the app-wide banner. Read-only, so HR Admin can
     * poll it without the full billing payload.
     */
    public function notice(Request $request): JsonResponse
    {
        $status = SubscriptionStatus::for($request->user()->company_id);

        return response()->json([
            'stage' => $status['stage'],
            'type' => $status['type'],
            'title' => $status['title'],
            'body' => $status['body'],
            'amount' => $status['amount'],
            'days_until_due' => $status['days_until_due'],
            'days_overdue' => $status['days_overdue'],
            'grace_days_left' => $status['grace_days_left'],
            'invoice_number' => $status['invoice']?->number,
            'due_at' => $status['invoice']?->due_at?->toDateString(),
            // Non-payment never restricts the tenant; the UI should warn, not gate.
            'restricts_access' => false,
        ]);
    }

    /** Update the subscription plan (per-employee rate; stored in settings). */
    public function updatePlan(Request $request): JsonResponse
    {
        $data = $request->validate([
            'plan_name' => ['required', 'string', 'max:60'],
            'rate_per_employee' => ['required', 'numeric', 'min:0', 'max:100000'],
            'billing_cycle' => ['required', 'in:monthly,annually'],
            'next_billing_at' => ['nullable', 'date'],
        ]);

        Setting::putMany([
            'billing_plan_name' => $data['plan_name'],
            'billing_rate_per_employee' => (string) $data['rate_per_employee'],
            'billing_cycle' => $data['billing_cycle'],
            'billing_next_at' => $data['next_billing_at'] ?? '',
        ]);

        return response()->json(['message' => 'Plan updated.', 'plan' => $this->plan($request->user()->company_id)]);
    }

    /** Auto-generate an invoice for the current period: rate × billable employees. */
    public function generateInvoice(Request $request): JsonResponse
    {
        $companyId = $request->user()->company_id;
        $rate = (float) Setting::get('billing_rate_per_employee', 50);
        $employees = $this->billableEmployees($companyId);
        $cycle = Setting::get('billing_cycle', 'monthly');
        $months = $cycle === 'annually' ? 12 : 1;
        $amount = round($rate * $employees * $months, 2);
        $period = $cycle === 'annually' ? now()->format('Y') : now()->format('F Y');

        $invoice = Invoice::create([
            'company_id' => $companyId,
            'number' => Invoice::nextNumber($companyId),
            'description' => Setting::get('billing_plan_name', 'Per-Employee') . " — {$employees} employees × " . number_format($rate, 2) . ($cycle === 'annually' ? '/yr' : '/mo'),
            'period_label' => $period,
            'amount' => $amount,
            'currency' => Setting::get('company_currency', 'PHP'),
            'status' => 'unpaid',
            'issued_at' => now()->toDateString(),
            'due_at' => now()->addDays((int) config('hris.billing.invoice_due_days', 15))->toDateString(),
        ]);

        return response()->json(['message' => "Invoice generated: {$employees} employees × " . number_format($rate, 2) . '.', 'invoice' => $this->shape($invoice)], 201);
    }

    /**
     * Headcount we bill for. Global scopes are dropped because the owner issues invoices
     * across tenants, so the company filter has to be explicit — without it this counts
     * every employee in the database and over-bills every tenant.
     */
    private function billableEmployees(int $companyId): int
    {
        return Employee::withoutGlobalScopes()
            ->where('company_id', $companyId)
            ->whereIn('status', ['regular', 'probationary'])
            ->count();
    }

    public function storeInvoice(Request $request): JsonResponse
    {
        $data = $request->validate([
            'description' => ['required', 'string', 'max:200'],
            'period_label' => ['nullable', 'string', 'max:60'],
            'amount' => ['required', 'numeric', 'min:0'],
            'issued_at' => ['required', 'date'],
            'due_at' => ['nullable', 'date', 'after_or_equal:issued_at'],
        ]);

        $companyId = $request->user()->company_id;
        $invoice = Invoice::create(array_merge($data, [
            'company_id' => $companyId,
            'number' => Invoice::nextNumber($companyId),
            'currency' => Setting::get('company_currency', 'PHP'),
        ]));

        return response()->json(['message' => 'Invoice created.', 'invoice' => $this->shape($invoice)], 201);
    }

    /** Owner-only (see `superadmin` middleware): records that a tenant has settled up. */
    public function markPaid(Request $request, Invoice $invoice): JsonResponse
    {
        // The owner bills every tenant, so they may settle an invoice outside their own
        // company; nobody else can reach this route at all.
        abort_unless(
            $request->user()->isSuperAdmin() || $invoice->company_id === $request->user()->company_id,
            404
        );

        if ($invoice->status === 'paid') {
            return response()->json(['message' => 'This invoice is already paid.'], 422);
        }

        $before = Auditor::before($invoice);
        $invoice->update(['status' => 'paid', 'paid_at' => now()]);

        Auditor::record('billing', 'paid', "Marked invoice {$invoice->number} as paid.", $invoice, Auditor::diff($invoice, $before));

        // Close the loop for the HR Admins who were being chased for this.
        Notifier::toUsers(SubscriptionStatus::recipients($invoice->company_id), [
            'type' => 'billing',
            'title' => 'Subscription payment received',
            'body' => "Invoice {$invoice->number} is settled. Thank you!",
            'link' => '/billing',
            'icon' => 'credit-card',
        ]);

        return response()->json(['message' => 'Invoice marked as paid.', 'invoice' => $this->shape($invoice)]);
    }

    public function destroyInvoice(Request $request, Invoice $invoice): JsonResponse
    {
        abort_unless($invoice->company_id === $request->user()->company_id, 404);
        $invoice->delete();

        return response()->json(['message' => 'Invoice deleted.']);
    }

    private function plan(int $companyId): array
    {
        $rate = (float) Setting::get('billing_rate_per_employee', 50);
        $cycle = Setting::get('billing_cycle', 'monthly');
        $employees = $this->billableEmployees($companyId);
        $months = $cycle === 'annually' ? 12 : 1;

        return [
            'name' => Setting::get('billing_plan_name', 'Per-Employee'),
            'rate_per_employee' => $rate,
            'cycle' => $cycle,
            'billable_employees' => $employees,
            'estimated_total' => round($rate * $employees * $months, 2),
            'next_billing_at' => Setting::get('billing_next_at') ?: null,
            'currency' => Setting::get('company_currency', 'PHP'),
            'remind_days_before' => (int) config('hris.billing.remind_days_before', 5),
            'grace_days' => (int) config('hris.billing.grace_days', 5),
        ];
    }

    private function shape(Invoice $i): array
    {
        // Surface overdue state on the fly for unpaid, past-due invoices.
        $status = $i->status;
        if ($status === 'unpaid' && $i->due_at && $i->due_at->isPast()) {
            $status = 'overdue';
        }

        return [
            'id' => $i->id,
            'number' => $i->number,
            'description' => $i->description,
            'period_label' => $i->period_label,
            'amount' => (float) $i->amount,
            'currency' => $i->currency,
            'status' => $status,
            'issued_at' => $i->issued_at->toDateString(),
            'due_at' => $i->due_at?->toDateString(),
            'paid_at' => $i->paid_at?->toIso8601String(),
        ];
    }
}
