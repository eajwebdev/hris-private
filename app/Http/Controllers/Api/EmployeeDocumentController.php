<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\EmployeeDocument;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class EmployeeDocumentController extends Controller
{
    public function store(Request $request, Employee $employee): JsonResponse
    {
        abort_unless($request->user()->canModule('employees', 'edit'), 403);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:150'],
            'category' => ['nullable', 'string', 'max:50'],
            'file' => ['required', 'file', 'max:10240'],
        ]);

        $file = $request->file('file');
        $path = $file->store("employees/{$employee->branch_id}/{$employee->id}/docs", 'public');

        $doc = $employee->documents()->create([
            'name' => $data['name'],
            'category' => $data['category'] ?? null,
            'path' => $path,
            'mime' => $file->getClientMimeType(),
            'size' => $file->getSize(),
        ]);

        return response()->json(['id' => $doc->id, 'name' => $doc->name, 'category' => $doc->category, 'url' => $doc->url, 'mime' => $doc->mime, 'size' => $doc->size], 201);
    }

    public function destroy(Request $request, Employee $employee, EmployeeDocument $document): JsonResponse
    {
        abort_unless($request->user()->canModule('employees', 'edit'), 403);
        abort_unless($document->employee_id === $employee->id, 404);

        Storage::disk('public')->delete($document->path);
        $document->delete();

        return response()->json(['message' => 'Document removed.']);
    }
}
