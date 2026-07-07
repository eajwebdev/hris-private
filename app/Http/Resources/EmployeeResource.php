<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class EmployeeResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'branch_id' => $this->branch_id,
            'department_id' => $this->department_id,
            'position_id' => $this->position_id,
            'manager_id' => $this->manager_id,
            'user_id' => $this->user_id,
            'employee_no' => $this->employee_no,
            'first_name' => $this->first_name,
            'middle_name' => $this->middle_name,
            'last_name' => $this->last_name,
            'full_name' => $this->full_name,
            'photo_url' => $this->photo_path ? asset('storage/' . $this->photo_path) : null,
            'email' => $this->email,
            'phone' => $this->phone,
            'birth_date' => $this->birth_date?->toDateString(),
            'gender' => $this->gender,
            'civil_status' => $this->civil_status,
            'address' => $this->address,
            'employment_type' => $this->employment_type,
            'status' => $this->status,
            'date_hired' => $this->date_hired?->toDateString(),
            'date_regularized' => $this->date_regularized?->toDateString(),
            'date_ended' => $this->date_ended?->toDateString(),
            'basic_salary' => (float) $this->basic_salary,
            'tin' => $this->tin,
            'sss' => $this->sss,
            'philhealth' => $this->philhealth,
            'pagibig' => $this->pagibig,
            'bank_name' => $this->bank_name,
            'bank_account' => $this->bank_account,
            'has_login' => (bool) $this->user_id,
            'branch' => $this->whenLoaded('branch', fn () => ['id' => $this->branch->id, 'name' => $this->branch->name]),
            'department' => $this->whenLoaded('department', fn () => $this->department ? ['id' => $this->department->id, 'name' => $this->department->name] : null),
            'position' => $this->whenLoaded('position', fn () => $this->position ? ['id' => $this->position->id, 'title' => $this->position->title] : null),
            'manager' => $this->whenLoaded('manager', fn () => $this->manager ? ['id' => $this->manager->id, 'name' => $this->manager->full_name] : null),
            'dependents' => EmployeeChildResource::collection($this->whenLoaded('dependents')),
            'emergency_contacts' => EmployeeChildResource::collection($this->whenLoaded('emergencyContacts')),
            'histories' => EmployeeChildResource::collection($this->whenLoaded('histories')),
            'documents' => $this->whenLoaded('documents', fn () => $this->documents->map(fn ($d) => [
                'id' => $d->id, 'name' => $d->name, 'category' => $d->category, 'url' => $d->url, 'mime' => $d->mime, 'size' => $d->size,
            ])),
        ];
    }
}
