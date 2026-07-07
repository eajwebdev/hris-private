<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\Department;
use App\Models\Employee;
use App\Models\Position;
use Illuminate\Http\Request;

/** Lightweight scoped lists for form dropdowns. */
class LookupController extends Controller
{
    public function branches(Request $request)
    {
        $ids = $request->user()->accessibleBranchIds();

        return Branch::whereIn('id', $ids)->orderBy('name')
            ->get(['id', 'name', 'code', 'latitude', 'longitude', 'geofence_radius']);
    }

    public function departments(Request $request)
    {
        return Department::query()
            ->when($request->filled('branch_id'), fn ($q) => $q->where('branch_id', $request->integer('branch_id')))
            ->orderBy('name')->get(['id', 'branch_id', 'name']);
    }

    public function positions(Request $request)
    {
        return Position::query()
            ->when($request->filled('branch_id'), fn ($q) => $q->where('branch_id', $request->integer('branch_id')))
            ->when($request->filled('department_id'), fn ($q) => $q->where('department_id', $request->integer('department_id')))
            ->orderBy('title')->get(['id', 'branch_id', 'department_id', 'title']);
    }

    public function managers(Request $request)
    {
        return Employee::query()
            ->when($request->filled('branch_id'), fn ($q) => $q->where('branch_id', $request->integer('branch_id')))
            ->orderBy('last_name')
            ->get(['id', 'first_name', 'last_name'])
            ->map(fn ($e) => ['id' => $e->id, 'name' => $e->full_name]);
    }
}
