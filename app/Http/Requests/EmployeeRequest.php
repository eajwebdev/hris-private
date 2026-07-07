<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class EmployeeRequest extends FormRequest
{
    public function authorize(): bool
    {
        $ability = $this->isMethod('post') ? 'create' : 'edit';

        return (bool) $this->user()?->canModule('employees', $ability);
    }

    public function rules(): array
    {
        $branchIds = $this->user()->accessibleBranchIds();

        return [
            'branch_id' => ['required', Rule::in($branchIds)],
            'department_id' => ['nullable', 'exists:departments,id'],
            'position_id' => ['nullable', 'exists:positions,id'],
            'manager_id' => ['nullable', 'exists:employees,id'],
            'employee_no' => ['nullable', 'string', 'max:50'],
            'first_name' => ['required', 'string', 'max:100'],
            'middle_name' => ['nullable', 'string', 'max:100'],
            'last_name' => ['required', 'string', 'max:100'],
            'email' => ['nullable', 'email', 'max:150'],
            'phone' => ['nullable', 'string', 'max:40'],
            'birth_date' => ['nullable', 'date'],
            'gender' => ['nullable', 'in:male,female,other'],
            'civil_status' => ['nullable', 'string', 'max:30'],
            'address' => ['nullable', 'string', 'max:500'],
            'employment_type' => ['required', 'in:full_time,part_time,contract'],
            'status' => ['required', 'in:probationary,regular,resigned,terminated'],
            'date_hired' => ['nullable', 'date'],
            'date_regularized' => ['nullable', 'date'],
            'date_ended' => ['nullable', 'date'],
            'basic_salary' => ['nullable', 'numeric', 'min:0'],
            'tin' => ['nullable', 'string', 'max:40'],
            'sss' => ['nullable', 'string', 'max:40'],
            'philhealth' => ['nullable', 'string', 'max:40'],
            'pagibig' => ['nullable', 'string', 'max:40'],
            'bank_name' => ['nullable', 'string', 'max:80'],
            'bank_account' => ['nullable', 'string', 'max:60'],
            'photo' => ['nullable', 'image', 'max:4096'],
        ];
    }
}
