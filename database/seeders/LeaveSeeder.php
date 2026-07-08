<?php

namespace Database\Seeders;

use App\Models\Company;
use App\Models\Employee;
use App\Models\LeaveBalance;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use Illuminate\Database\Seeder;

class LeaveSeeder extends Seeder
{
    public function run(): void
    {
        $company = Company::first();
        if (! $company) {
            return;
        }

        $types = [
            ['name' => 'Vacation Leave', 'code' => 'VL', 'default_days' => 15, 'is_paid' => true, 'color' => '#d61b5d'],
            ['name' => 'Sick Leave', 'code' => 'SL', 'default_days' => 15, 'is_paid' => true, 'color' => '#5b7cfa'],
            ['name' => 'Emergency Leave', 'code' => 'EL', 'default_days' => 5, 'is_paid' => true, 'color' => '#e39a3b'],
            ['name' => 'Leave Without Pay', 'code' => 'LWOP', 'default_days' => 0, 'is_paid' => false, 'color' => '#64748b'],
        ];

        foreach ($types as $t) {
            LeaveType::firstOrCreate(
                ['company_id' => $company->id, 'code' => $t['code']],
                array_merge($t, ['company_id' => $company->id]),
            );
        }

        // Current-year balances for all active employees.
        $activeTypes = LeaveType::where('company_id', $company->id)->where('is_active', true)->get();
        $employees = Employee::withoutGlobalScopes()->whereIn('status', ['regular', 'probationary'])->get();
        foreach ($employees as $employee) {
            foreach ($activeTypes as $type) {
                LeaveBalance::current($employee->id, $type);
            }
        }

        // A few sample requests so the approval queue isn't empty.
        if (LeaveRequest::withoutGlobalScopes()->count() === 0 && $employees->count() >= 3) {
            $vl = $activeTypes->firstWhere('code', 'VL');
            $sl = $activeTypes->firstWhere('code', 'SL');

            $mk = function (Employee $e, LeaveType $t, int $startInDays, int $len, string $status) {
                $from = now()->addDays($startInDays);
                while ($from->isWeekend()) {
                    $from->addDay();
                }
                $to = $from->copy()->addDays($len - 1);
                $days = LeaveRequest::workingDays($from, $to);

                $leave = LeaveRequest::create([
                    'employee_id' => $e->id,
                    'branch_id' => $e->branch_id,
                    'leave_type_id' => $t->id,
                    'date_from' => $from->toDateString(),
                    'date_to' => $to->toDateString(),
                    'days' => $days,
                    'reason' => 'Seeded sample request',
                    'status' => $status,
                    'acted_at' => $status === 'pending' ? null : now(),
                ]);

                if ($status === 'approved') {
                    LeaveBalance::current($e->id, $t)->increment('used', $days);
                }

                return $leave;
            };

            $mk($employees[0], $vl, 7, 3, 'pending');
            $mk($employees[1], $sl, 3, 1, 'pending');
            $mk($employees[2], $vl, 0, 2, 'approved'); // on leave today → feeds the KPI
        }
    }
}
