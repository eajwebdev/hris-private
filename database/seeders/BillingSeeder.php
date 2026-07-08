<?php

namespace Database\Seeders;

use App\Models\Company;
use App\Models\Employee;
use App\Models\Invoice;
use App\Models\Setting;
use Illuminate\Database\Seeder;

class BillingSeeder extends Seeder
{
    public function run(): void
    {
        $company = Company::first();
        if (! $company || Invoice::where('company_id', $company->id)->exists()) {
            return;
        }

        $rate = 50.0; // ₱ per employee per month
        Setting::putMany([
            'billing_plan_name' => 'Per-Employee',
            'billing_rate_per_employee' => (string) $rate,
            'billing_cycle' => 'monthly',
            'billing_next_at' => now()->addMonth()->startOfMonth()->toDateString(),
        ]);

        $employees = Employee::withoutGlobalScopes()->whereIn('status', ['regular', 'probationary'])->count();
        $amount = round($rate * max($employees, 1), 2);

        $rows = [
            ['months' => 2, 'status' => 'paid'],
            ['months' => 1, 'status' => 'paid'],
            ['months' => 0, 'status' => 'unpaid'],
        ];

        foreach ($rows as $r) {
            $issued = now()->subMonths($r['months'])->startOfMonth();
            Invoice::create([
                'company_id' => $company->id,
                'number' => Invoice::nextNumber($company->id),
                'description' => "EAJ HRIS — {$employees} employees × " . number_format($rate, 2) . '/mo',
                'period_label' => $issued->format('F Y'),
                'amount' => $amount,
                'currency' => 'PHP',
                'status' => $r['status'],
                'issued_at' => $issued->toDateString(),
                'due_at' => $issued->copy()->addDays(15)->toDateString(),
                'paid_at' => $r['status'] === 'paid' ? $issued->copy()->addDays(3) : null,
            ]);
        }
    }
}
