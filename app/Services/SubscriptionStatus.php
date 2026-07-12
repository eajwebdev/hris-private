<?php

namespace App\Services;

use App\Models\Invoice;
use App\Models\User;
use Illuminate\Support\Collection;

/**
 * The tenant's standing on its *subscription* to this system — not employee payroll.
 *
 * One source of truth for both the in-app banner (BillingController::notice) and the
 * daily reminder job (billing:remind), so what HR sees and what we notify about can
 * never drift apart.
 *
 * Non-payment never restricts the tenant. The worst state is `delinquent`, which is
 * still only a louder warning.
 */
class SubscriptionStatus
{
    /** Ordered by escalation; `stage` doubles as the reminder's idempotency key. */
    public const OK = 'ok';
    public const DUE_SOON = 'due_soon';     // Within the reminder window, not yet due.
    public const DUE_TODAY = 'due_today';
    public const GRACE = 'grace';           // Past due, inside the grace period.
    public const DELINQUENT = 'delinquent'; // Past due, grace exhausted.

    /**
     * The company's current standing, driven by its oldest unpaid invoice.
     *
     * @return array{
     *     stage: string, invoice: ?Invoice, days_until_due: ?int, days_overdue: ?int,
     *     grace_days_left: ?int, amount: float, title: string, body: string, type: string
     * }
     */
    public static function for(int $companyId): array
    {
        $invoice = Invoice::where('company_id', $companyId)
            ->whereIn('status', ['unpaid', 'overdue'])
            ->whereNotNull('due_at')
            ->orderBy('due_at')
            ->first();

        $outstanding = (float) Invoice::where('company_id', $companyId)
            ->whereIn('status', ['unpaid', 'overdue'])
            ->sum('amount');

        if (! $invoice) {
            return self::clear($outstanding);
        }

        $remindBefore = (int) config('hris.billing.remind_days_before', 5);
        $graceDays = (int) config('hris.billing.grace_days', 5);

        // startOfDay on both sides: a due date is a *date*, so "days left" must not
        // swing on the time of day the job happens to run.
        $today = now()->startOfDay();
        $due = $invoice->due_at->copy()->startOfDay();

        // Signed: positive => still ahead of us, negative => past due. Cast to int —
        // Carbon returns a float, and 0.0 would slip past the `=== 0` due-today check.
        $daysUntilDue = (int) $today->diffInDays($due, false);
        $daysOverdue = max(0, -$daysUntilDue);

        $money = number_format((float) $invoice->amount, 2) . ' ' . $invoice->currency;

        if ($daysUntilDue > $remindBefore) {
            return self::clear($outstanding, $invoice);
        }

        if ($daysUntilDue > 0) {
            return [
                'stage' => self::DUE_SOON,
                'invoice' => $invoice,
                'days_until_due' => $daysUntilDue,
                'days_overdue' => 0,
                'grace_days_left' => $graceDays,
                'amount' => (float) $invoice->amount,
                'type' => 'info',
                'title' => "Subscription payment due in {$daysUntilDue} " . self::plural($daysUntilDue, 'day'),
                'body' => "Invoice {$invoice->number} ({$money}) is due on {$due->format('M j, Y')}.",
            ];
        }

        if ($daysUntilDue === 0) {
            return [
                'stage' => self::DUE_TODAY,
                'invoice' => $invoice,
                'days_until_due' => 0,
                'days_overdue' => 0,
                'grace_days_left' => $graceDays,
                'amount' => (float) $invoice->amount,
                'type' => 'warning',
                'title' => 'Subscription payment is due today',
                'body' => "Invoice {$invoice->number} ({$money}) is due today. You have {$graceDays} " . self::plural($graceDays, 'day') . ' after today to settle it.',
            ];
        }

        if ($daysOverdue <= $graceDays) {
            $left = $graceDays - $daysOverdue;

            return [
                'stage' => self::GRACE,
                'invoice' => $invoice,
                'days_until_due' => 0,
                'days_overdue' => $daysOverdue,
                'grace_days_left' => $left,
                'amount' => (float) $invoice->amount,
                'type' => 'warning',
                'title' => $left > 0
                    ? "Subscription overdue — {$left} " . self::plural($left, 'day') . ' left to pay'
                    : 'Subscription overdue — last day of the grace period',
                'body' => "Invoice {$invoice->number} ({$money}) was due {$due->format('M j, Y')}. Please settle it to keep your account in good standing.",
            ];
        }

        return [
            'stage' => self::DELINQUENT,
            'invoice' => $invoice,
            'days_until_due' => 0,
            'days_overdue' => $daysOverdue,
            'grace_days_left' => 0,
            'amount' => (float) $invoice->amount,
            'type' => 'error',
            'title' => "Subscription {$daysOverdue} " . self::plural($daysOverdue, 'day') . ' overdue',
            'body' => "Invoice {$invoice->number} ({$money}) was due {$due->format('M j, Y')} and the grace period has passed. Your HRIS stays fully available — please contact the system administrator to settle payment.",
        ];
    }

    /** Recipients of billing reminders: the tenant's HR Admins, plus the owner. */
    public static function recipients(int $companyId): Collection
    {
        return User::query()
            ->where('is_active', true)
            ->where(fn ($q) => $q
                ->where(fn ($tenant) => $tenant->where('company_id', $companyId)->where('preset', 'hr_admin'))
                ->orWhere('is_super_admin', true))
            ->pluck('id');
    }

    private static function clear(float $outstanding, ?Invoice $invoice = null): array
    {
        return [
            'stage' => self::OK,
            'invoice' => $invoice,
            'days_until_due' => $invoice?->due_at
                ? (int) now()->startOfDay()->diffInDays($invoice->due_at->copy()->startOfDay(), false)
                : null,
            'days_overdue' => 0,
            'grace_days_left' => null,
            'amount' => $outstanding,
            'type' => 'info',
            'title' => '',
            'body' => '',
        ];
    }

    private static function plural(int $n, string $word): string
    {
        return $n === 1 ? $word : $word . 's';
    }
}
