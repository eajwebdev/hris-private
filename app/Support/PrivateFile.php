<?php

namespace App\Support;

use Illuminate\Support\Facades\URL;

/**
 * Sensitive uploads (201 documents, resumes, medical certificates, punch photos)
 * live on the PRIVATE disk — never under public/storage, where anything with the
 * URL is world-readable and an uploaded .html/.svg would run on our own origin.
 *
 * They are handed to the browser as short-lived signed URLs instead. The signature
 * is minted only after the caller has already passed the module/branch check on the
 * listing endpoint, and it expires, so a leaked link is not a permanent back door.
 *
 * Signed URLs are used rather than a bearer-token route because the SPA renders some
 * of these (punch photos) in plain <img> tags, which cannot carry an Authorization header.
 */
class PrivateFile
{
    /** Disk holding every file that is not deliberately public. */
    public const DISK = 'private';

    /** How long a handed-out link stays good for. */
    private const TTL_MINUTES = 20;

    /** A short-lived signed URL for a private path, or null if there is no file. */
    public static function url(?string $path): ?string
    {
        if (! $path) {
            return null;
        }

        // Relative signature: an absolute one is computed over APP_URL, which silently
        // breaks every link the moment the app sits behind a proxy or load balancer
        // that terminates TLS on a different host.
        return URL::temporarySignedRoute(
            'files.show',
            now()->addMinutes(self::TTL_MINUTES),
            ['path' => $path],
            absolute: false,
        );
    }
}
