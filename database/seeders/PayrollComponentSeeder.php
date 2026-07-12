<?php

namespace Database\Seeders;

use App\Models\Company;
use App\Models\PayrollComponent;
use Illuminate\Database\Seeder;

/**
 * Seeds a starting set of salary components. Every one of these is an ordinary
 * editable row — HR can change the rates, deactivate them, or add their own.
 */
class PayrollComponentSeeder extends Seeder
{
    public function run(): void
    {
        $company = Company::query()->first();
        if (! $company) {
            $this->command?->warn('PayrollComponentSeeder: no company.');

            return;
        }

        $components = [
            // -- Statutory deductions (PH employee shares; rates are editable) --
            [
                'code' => 'sss', 'name' => 'SSS Contribution', 'type' => 'deduction',
                'calc' => 'percent_basic', 'amount' => 4.5, 'is_statutory' => true, 'sort_order' => 10,
            ],
            [
                'code' => 'philhealth', 'name' => 'PhilHealth', 'type' => 'deduction',
                'calc' => 'percent_basic', 'amount' => 2.5, 'is_statutory' => true, 'sort_order' => 20,
            ],
            [
                'code' => 'pagibig', 'name' => 'Pag-IBIG', 'type' => 'deduction',
                'calc' => 'fixed', 'amount' => 200, 'is_statutory' => true, 'sort_order' => 30,
            ],
            [
                // Philippine withholding tax is progressive (graduated brackets), so a
                // flat percentage would silently produce wrong payroll. Seeded at 0 —
                // i.e. off — for HR to set deliberately.
                'code' => 'withholding_tax', 'name' => 'Withholding Tax', 'type' => 'deduction',
                'calc' => 'percent_gross', 'amount' => 0, 'is_statutory' => true, 'sort_order' => 40,
            ],

            // -- Allowances: assigned per employee rather than company-wide --------
            [
                'code' => 'meal', 'name' => 'Meal Allowance', 'type' => 'earning',
                'calc' => 'fixed', 'amount' => 2000, 'applies_to_all' => false, 'is_taxable' => false, 'sort_order' => 10,
            ],
            [
                'code' => 'transport', 'name' => 'Transport Allowance', 'type' => 'earning',
                'calc' => 'fixed', 'amount' => 1500, 'applies_to_all' => false, 'is_taxable' => false, 'sort_order' => 20,
            ],
        ];

        foreach ($components as $c) {
            PayrollComponent::updateOrCreate(
                ['company_id' => $company->id, 'code' => $c['code']],
                array_merge([
                    'branch_id' => null,
                    'is_statutory' => false,
                    'is_active' => true,
                    'applies_to_all' => true,
                    'is_taxable' => true,
                ], $c),
            );
        }

        $this->command?->info('Seeded ' . count($components) . ' payroll components (withholding tax left at 0 — set it in Payroll → Components).');
    }
}
