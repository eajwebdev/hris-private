<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** Generic passthrough for employee sub-records (dependents, contacts, history). */
class EmployeeChildResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return array_merge($this->resource->toArray(), [
            'birth_date' => $this->resource->birth_date?->toDateString() ?? $this->resource->birth_date ?? null,
        ]);
    }
}
