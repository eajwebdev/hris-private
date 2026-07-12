<?php

namespace App\Console\Commands;

use App\Models\AppNotification;
use App\Models\Company;
use App\Services\Notifier;
use App\Services\SubscriptionStatus;
use Illuminate\Console\Command;

/**
 * Daily subscription reminders for every tenant.
 *
 * Escalates: 5 days before due -> due today -> each day of the 5-day grace period ->
 * delinquent. It never restricts the tenant; the notification *is* the enforcement.
 */
class SendBillingReminders extends Command
{
    protected $signature = 'billing:remind {--company= : Only this company id} {--dry-run : Print what would be sent, send nothing}';

    protected $description = 'Notify HR Admins (and the owner) about upcoming and overdue subscription payments.';

    public function handle(): int
    {
        $companies = Company::query()
            ->when($this->option('company'), fn ($q, $id) => $q->whereKey($id))
            ->get();

        $sent = 0;

        foreach ($companies as $company) {
            $status = SubscriptionStatus::for($company->id);

            if ($status['stage'] === SubscriptionStatus::OK) {
                continue;
            }

            $recipients = SubscriptionStatus::recipients($company->id)
                // At most one billing nudge per person per day, so re-running the
                // command (or a retried schedule) can't stack duplicates.
                ->reject(fn (int $userId) => AppNotification::where('user_id', $userId)
                    ->where('type', 'billing')
                    ->whereDate('created_at', now()->toDateString())
                    ->exists())
                ->values();

            $this->line(sprintf(
                '%s: %s — %d recipient(s)%s',
                $company->name,
                $status['stage'],
                $recipients->count(),
                $this->option('dry-run') ? ' [dry run]' : '',
            ));

            if ($recipients->isEmpty() || $this->option('dry-run')) {
                continue;
            }

            Notifier::toUsers($recipients, [
                'type' => 'billing',
                'title' => $status['title'],
                'body' => $status['body'],
                'link' => '/billing',
                'icon' => 'credit-card',
            ]);

            $sent += $recipients->count();
        }

        $this->info("Billing reminders sent: {$sent}");

        return self::SUCCESS;
    }
}
