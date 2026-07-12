<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\PrivateFile;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Streams a file off the private disk. Reachable only through a signed, expiring
 * URL minted by PrivateFile::url() after the caller passed the module/branch check
 * on whichever endpoint listed the file.
 */
class FileController extends Controller
{
    /**
     * Types we are willing to hand back inline. Anything else is forced to download,
     * so a stored .html/.svg can never execute as a document on our own origin.
     */
    private const INLINE_MIMES = [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
    ];

    public function show(string $path): StreamedResponse
    {
        // The `signed` middleware already proves we minted this URL, but a signature
        // covers the path as given — normalise anyway so a crafted route parameter
        // can never climb out of the disk root.
        $path = ltrim(str_replace('\\', '/', $path), '/');
        abort_if($path === '' || str_contains($path, '..'), 404);

        $disk = Storage::disk(PrivateFile::DISK);
        abort_unless($disk->exists($path), 404);

        $mime = $disk->mimeType($path) ?: 'application/octet-stream';
        $disposition = in_array($mime, self::INLINE_MIMES, true) ? 'inline' : 'attachment';

        return $disk->response($path, basename($path), [
            'Content-Type' => $disposition === 'inline' ? $mime : 'application/octet-stream',
            'Content-Disposition' => $disposition . '; filename="' . basename($path) . '"',
            'X-Content-Type-Options' => 'nosniff',
            'Cache-Control' => 'private, max-age=300, no-store',
        ]);
    }
}
