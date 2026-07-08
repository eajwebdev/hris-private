<?php

namespace Database\Seeders;

use App\Models\Branch;
use App\Models\Company;
use App\Models\JobApplication;
use App\Models\JobOpening;
use App\Models\User;
use Illuminate\Database\Seeder;

class RecruitmentSeeder extends Seeder
{
    public function run(): void
    {
        $company = Company::first();
        if (! $company || JobOpening::where('company_id', $company->id)->exists()) {
            return;
        }

        $branch = Branch::where('company_id', $company->id)->first();
        $creator = User::where('company_id', $company->id)->where('is_super_admin', true)->first();

        $openings = [
            [
                'title' => 'HR Officer',
                'department' => 'Human Resources',
                'employment_type' => 'full_time',
                'salary_range' => '₱25,000 – ₱35,000',
                'description' => "We're looking for an HR Officer to support recruitment, onboarding and employee relations across our branches.\n\nResponsibilities:\n• End-to-end recruitment\n• 201 file management\n• Attendance and leave coordination",
            ],
            [
                'title' => 'Frontend Developer',
                'department' => 'Engineering',
                'employment_type' => 'full_time',
                'salary_range' => '₱45,000 – ₱70,000',
                'description' => "Join our engineering team building the EAJ HRIS. Strong React and Tailwind skills required.",
            ],
            [
                'title' => 'Accounting Intern',
                'department' => 'Finance',
                'employment_type' => 'internship',
                'salary_range' => 'Allowance provided',
                'description' => "A hands-on internship supporting the finance team with payroll and bookkeeping.",
            ],
        ];

        foreach ($openings as $data) {
            $opening = JobOpening::create(array_merge($data, [
                'company_id' => $company->id,
                'branch_id' => $branch?->id,
                'slug' => JobOpening::uniqueSlug($data['title']),
                'location' => $branch?->name,
                'openings_count' => 1,
                'status' => 'open',
                'created_by' => $creator?->id,
                'published_at' => now(),
            ]));

            foreach (JobOpening::DEFAULT_REQUIREMENTS as $i => $req) {
                $opening->requirements()->create(array_merge($req, ['sort' => $i]));
            }
        }

        // A sample application on the first opening so HR's queue isn't empty.
        $first = JobOpening::where('company_id', $company->id)->first();
        JobApplication::create([
            'job_opening_id' => $first->id,
            'first_name' => 'Maria',
            'last_name' => 'Santos',
            'email' => 'maria.santos@example.com',
            'phone' => '0917 555 0101',
            'cover_letter' => 'I am excited to apply for this role and believe my background is a strong match.',
            'status' => 'applied',
        ]);
    }
}
