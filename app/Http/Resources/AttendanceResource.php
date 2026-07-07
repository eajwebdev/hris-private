<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AttendanceResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'employee_id' => $this->employee_id,
            'branch_id' => $this->branch_id,
            'work_date' => $this->work_date->toDateString(),
            'clock_ins' => $this->clock_ins,
            'clock_outs' => $this->clock_outs,
            'punches' => $this->punches,
            'next_action' => $this->next_action,
            'late_am_minutes' => $this->late_am_minutes,
            'late_pm_minutes' => $this->late_pm_minutes,
            'early_out_minutes' => $this->early_out_minutes,
            'undertime_minutes' => $this->undertime_minutes,
            'worked_hours' => (float) $this->worked_hours,
            'is_incomplete' => $this->is_incomplete,
            'note' => $this->note,
            'employee' => $this->whenLoaded('employee', fn () => [
                'id' => $this->employee->id,
                'name' => $this->employee->full_name,
                'photo_url' => $this->employee->photo_path ? asset('storage/' . $this->employee->photo_path) : null,
                'position' => $this->employee->position?->title,
                'department' => $this->employee->department?->name,
            ]),
        ];
    }
}
