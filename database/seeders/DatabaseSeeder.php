<?php

namespace Database\Seeders;

use App\Models\Branch;
use App\Models\Company;
use App\Models\Department;
use App\Models\PermissionPreset;
use App\Models\Position;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // --- Presets from config -------------------------------------------------
        foreach (config('hris.presets') as $key => $def) {
            PermissionPreset::updateOrCreate(
                ['company_id' => null, 'key' => $key],
                [
                    'label' => $def['label'],
                    'grants_all' => $def['all'] ?? false,
                    'modules' => $def['modules'] ?? [],
                    'is_system' => true,
                ]
            );
        }

        // --- Company -------------------------------------------------------------
        $company = Company::updateOrCreate(
            ['slug' => 'eaj'],
            ['name' => 'EAJ Systems', 'legal_name' => 'EAJ Systems Inc.', 'email' => 'hr@eajsystems.com', 'currency' => 'PHP']
        );

        // --- Branches ------------------------------------------------------------
        $makati = Branch::updateOrCreate(
            ['company_id' => $company->id, 'name' => 'Makati HQ'],
            ['code' => 'MKT', 'address' => 'Ayala Ave, Makati City', 'latitude' => 14.5547, 'longitude' => 121.0244, 'timezone' => 'Asia/Manila']
        );
        $cebu = Branch::updateOrCreate(
            ['company_id' => $company->id, 'name' => 'Cebu Branch'],
            ['code' => 'CEB', 'address' => 'IT Park, Cebu City', 'latitude' => 10.3300, 'longitude' => 123.9060, 'timezone' => 'Asia/Manila']
        );

        // --- Default work schedules (four checkpoints) --------------------------
        foreach ([$makati, $cebu] as $branch) {
            \App\Models\WorkSchedule::updateOrCreate(
                ['branch_id' => $branch->id, 'name' => 'Standard 8–5'],
                ['morning_in' => '08:00', 'morning_out' => '12:00', 'afternoon_in' => '13:00', 'afternoon_out' => '17:00', 'grace_minutes' => 10, 'is_default' => true]
            );
        }

        // --- Departments & positions --------------------------------------------
        foreach ([$makati, $cebu] as $branch) {
            foreach (['Human Resources', 'Engineering', 'Sales', 'Operations'] as $deptName) {
                $dept = Department::updateOrCreate(['branch_id' => $branch->id, 'name' => $deptName]);
                Position::updateOrCreate(['branch_id' => $branch->id, 'department_id' => $dept->id, 'title' => $deptName . ' Staff']);
                Position::updateOrCreate(['branch_id' => $branch->id, 'department_id' => $dept->id, 'title' => $deptName . ' Lead']);
            }
        }

        // --- Users ---------------------------------------------------------------
        $super = User::updateOrCreate(
            ['email' => 'admin@eaj.test'],
            ['name' => 'Ed Zavril', 'password' => Hash::make('password'), 'company_id' => $company->id, 'is_super_admin' => true, 'preset' => 'super_admin']
        );
        $super->branches()->sync([$makati->id, $cebu->id]);

        $hr = User::updateOrCreate(
            ['email' => 'hr@eaj.test'],
            ['name' => 'Hazel Reyes', 'password' => Hash::make('password'), 'company_id' => $company->id, 'preset' => 'hr_admin']
        );
        $hr->branches()->sync([$makati->id]);

        $employee = User::updateOrCreate(
            ['email' => 'employee@eaj.test'],
            ['name' => 'Marco Cruz', 'password' => Hash::make('password'), 'company_id' => $company->id, 'preset' => 'employee']
        );
        $employee->branches()->sync([$makati->id]);

        // --- System settings defaults (name + branding) -------------------------
        \App\Models\Setting::putMany([
            'system_name' => 'EAJ HRIS',
            'system_tagline' => 'Human Resources',
            'theme_mode' => 'light',
            'theme_brand' => '#d61b5d',
            'theme_amber' => '#e39a3b',
        ]);

        // --- Demo employees ------------------------------------------------------
        $this->callWith(EmployeeSeeder::class, ['company' => $company, 'branches' => [$makati, $cebu], 'essUser' => $employee]);
        $this->call(AttendanceSeeder::class);
        $this->call(LeaveSeeder::class);
        $this->call(RecruitmentSeeder::class);
        $this->call(BillingSeeder::class);
        $this->call(ServiceCreditSeeder::class);
        $this->call(PerformanceSeeder::class);
        $this->call(PayrollComponentSeeder::class);
        $this->callWith(ContentSeeder::class, ['company' => $company, 'branches' => [$makati, $cebu], 'author' => $super]);

        $this->command->info('Seeded: admin@eaj.test / hr@eaj.test / employee@eaj.test — all password "password".');
    }
}
