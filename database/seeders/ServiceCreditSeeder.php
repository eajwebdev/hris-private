<?php

namespace Database\Seeders;

use App\Models\Company;
use App\Models\Employee;
use App\Models\ServiceCredit;
use App\Models\Setting;
use App\Models\User;
use Illuminate\Database\Seeder;

class ServiceCreditSeeder extends Seeder
{
    public function run(): void
    {
        $company = Company::first();
        if (! $company || ServiceCredit::withoutGlobalScopes()->exists()) {
            return;
        }

        Setting::putMany(['service_credit_annual_cap' => '15']);

        $hr = User::where('company_id', $company->id)->where('is_super_admin', true)->first();
        $employees = Employee::withoutGlobalScopes()->whereIn('status', ['regular', 'probationary'])->take(4)->get();
        if ($employees->count() < 3) {
            return;
        }

        // HR-granted (approved) earns → give the first few employees a balance.
        foreach ($employees->take(3) as $i => $e) {
            ServiceCredit::create([
                'employee_id' => $e->id,
                'branch_id' => $e->branch_id,
                'entry_type' => 'earn',
                'days' => [3, 2, 1.5][$i],
                'service_date' => now()->subDays(10 + $i * 3)->toDateString(),
                'reason' => 'Rendered service during weekend company activity',
                'status' => 'approved',
                'source' => 'grant',
                'acted_by' => $hr?->id,
                'acted_at' => now()->subDays(9 + $i * 3),
            ]);
        }

        // A pending earn request + a pending use request for the approval queue.
        $a = $employees[0];
        ServiceCredit::create([
            'employee_id' => $a->id,
            'branch_id' => $a->branch_id,
            'entry_type' => 'earn',
            'days' => 1,
            'service_date' => now()->subDays(2)->toDateString(),
            'reason' => 'Overtime for month-end inventory',
            'status' => 'pending',
            'source' => 'request',
        ]);

        $b = $employees[1];
        ServiceCredit::create([
            'employee_id' => $b->id,
            'branch_id' => $b->branch_id,
            'entry_type' => 'use',
            'days' => 1,
            'service_date' => now()->addDays(3)->toDateString(),
            'reason' => 'Personal errand — will offset with credits',
            'status' => 'pending',
            'source' => 'request',
        ]);
    }
}
