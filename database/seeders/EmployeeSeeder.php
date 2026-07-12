<?php

namespace Database\Seeders;

use App\Models\Employee;
use Illuminate\Database\Seeder;

class EmployeeSeeder extends Seeder
{
    public function run($company, array $branches, $essUser = null): void
    {
        $faker = \Faker\Factory::create('en_PH');
        $types = ['full_time', 'full_time', 'full_time', 'part_time', 'contract'];
        $statuses = ['regular', 'regular', 'regular', 'probationary', 'resigned'];

        foreach ($branches as $branch) {
            $depts = $branch->departments()->get();
            $managers = [];

            // One lead per department first (so we can wire reporting lines).
            foreach ($depts as $dept) {
                $pos = $dept->positions()->where('title', 'like', '%Lead%')->first();
                $lead = Employee::create($this->row($faker, $company, $branch, $dept, $pos, 'regular', 'full_time'));
                $managers[$dept->id] = $lead->id;
            }

            // Then staff reporting to their department lead.
            foreach ($depts as $dept) {
                $pos = $dept->positions()->where('title', 'like', '%Staff%')->first();
                $count = rand(2, 4);
                for ($i = 0; $i < $count; $i++) {
                    Employee::create(array_merge(
                        $this->row($faker, $company, $branch, $dept, $pos, $faker->randomElement($statuses), $faker->randomElement($types)),
                        ['manager_id' => $managers[$dept->id] ?? null]
                    ));
                }
            }
        }

        // Link the ESS demo user to a real employee record in Makati HR.
        if ($essUser) {
            $emp = Employee::where('branch_id', $branches[0]->id)->whereNull('user_id')->first();
            $emp?->update(['user_id' => $essUser->id, 'email' => $essUser->email, 'first_name' => 'Marco', 'last_name' => 'Cruz']);
        }
    }

    private function row($faker, $company, $branch, $dept, $pos, $status, $type): array
    {
        static $seq = 1000;
        $seq++;

        $hired = $faker->dateTimeBetween('-6 years', '-2 months');

        return [
            'branch_id' => $branch->id,
            'company_id' => $company->id,
            'department_id' => $dept->id,
            'position_id' => $pos?->id,
            'employee_no' => $branch->code . '-' . $seq,
            'first_name' => $faker->firstName(),
            'last_name' => $faker->lastName(),
            'email' => $faker->unique()->safeEmail(),
            'phone' => $faker->numerify('09#########'),
            'birth_date' => $faker->dateTimeBetween('-55 years', '-21 years')->format('Y-m-d'),
            'gender' => $faker->randomElement(['male', 'female']),
            'civil_status' => $faker->randomElement(['Single', 'Married']),
            'address' => $faker->address(),
            'employment_type' => $type,
            'status' => $status,
            'date_hired' => $hired->format('Y-m-d'),
            // Someone who has left must carry an end date — turnover analytics reads it.
            'date_ended' => $status === 'resigned'
                ? $faker->dateTimeBetween($hired, 'now')->format('Y-m-d')
                : null,
            'basic_salary' => $faker->numberBetween(18000, 90000),
            'tin' => $faker->numerify('###-###-###'),
            'sss' => $faker->numerify('##-#######-#'),
            'philhealth' => $faker->numerify('##-#########-#'),
            'pagibig' => $faker->numerify('####-####-####'),
            'bank_name' => $faker->randomElement(['BDO', 'BPI', 'Metrobank', 'UnionBank']),
            'bank_account' => $faker->numerify('##########'),
        ];
    }
}
