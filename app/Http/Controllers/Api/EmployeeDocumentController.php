<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\EmployeeDocument;
use App\Support\PrivateFile;
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
            // An allowlist, not a size cap alone. `mimes` checks the extension against the
            // file's sniffed type, so a PHP script renamed to .pdf is rejected. Without it
            // a 201 upload was an arbitrary-file write into web-served storage.
            'file' => ['required', 'file', 'mimes:pdf,doc,docx,xls,xlsx,jpg,jpeg,png', 'max:10240'],
        ], [
            'file.mimes' => 'Allowed types: PDF, DOC, DOCX, XLS, XLSX, JPG, PNG.',
        ]);

        $file = $request->file('file');

        // 201 files are contracts, IDs and medical records. On the public disk they were
        // readable by anyone holding the URL, with no login at all.
        $path = $file->store("employees/{$employee->branch_id}/{$employee->id}/docs", PrivateFile::DISK);

        $doc = $employee->documents()->create([
            'name' => $data['name'],
            'category' => $data['category'] ?? null,
            'path' => $path,
            // The sniffed type, not the client-supplied Content-Type header.
            'mime' => $file->getMimeType(),
            'size' => $file->getSize(),
        ]);

        return response()->json([
            'id' => $doc->id,
            'name' => $doc->name,
            'category' => $doc->category,
            'url' => $doc->url,
            'mime' => $doc->mime,
            'size' => $doc->size,
        ], 201);
    }

    public function destroy(Request $request, Employee $employee, EmployeeDocument $document): JsonResponse
    {
        abort_unless($request->user()->canModule('employees', 'edit'), 403);
        abort_unless($document->employee_id === $employee->id, 404);

        Storage::disk(PrivateFile::DISK)->delete($document->path);
        $document->delete();

        return response()->json(['message' => 'Document removed.']);
    }
}
