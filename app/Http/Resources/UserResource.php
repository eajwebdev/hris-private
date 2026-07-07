<?php

namespace App\Http\Resources;

use App\Support\Permissions;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'company_id' => $this->company_id,
            'is_super_admin' => (bool) $this->is_super_admin,
            'preset' => $this->preset,
            'avatar_url' => $this->avatar_path ? asset('storage/' . $this->avatar_path) : null,
            'is_active' => (bool) $this->is_active,
            'roles' => $this->getRoleNames(),
            'branches' => $this->branches->map(fn ($b) => [
                'id' => $b->id, 'name' => $b->name, 'code' => $b->code,
            ]),
            'permissions' => Permissions::effective($this->resource),
            'employee_id' => $this->whenLoaded('employee', fn () => $this->employee?->id),
        ];
    }
}
