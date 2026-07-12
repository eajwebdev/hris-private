<?php

namespace App\Console\Commands;

use App\Models\Attendance;
use App\Models\EmployeeDocument;
use App\Models\JobApplicationDocument;
use App\Models\LeaveRequest;
use App\Support\PrivateFile;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

/**
 * One-shot migration for deployments that predate the private disk.
 *
 * 201 documents, applicant CVs, medical certificates and punch photos used to be
 * written to storage/app/public, which is symlinked into the web root — anyone with
 * the URL could read them, with no login. This relocates them to the private disk.
 *
 * It is driven off the database rather than the filesystem on purpose: the public
 * `employees/` folder holds BOTH avatars (which are meant to be public and stay) and
 * documents (which are not). Only paths a sensitive model actually points at get moved.
 *
 * Paths are identical on both disks, so the stored path column needs no rewriting.
 * Safe to re-run: anything already moved is skipped.
 */
class SecureUploads extends Command
{
    protected $signature = 'hris:secure-uploads {--dry-run : List what would move without touching anything}';

    protected $description = 'Move sensitive uploads off the web-readable public disk onto the private disk';

    public function handle(): int
    {
        $dry = (bool) $this->option('dry-run');
        $public = Storage::disk('public');
        $private = Storage::disk(PrivateFile::DISK);

        $paths = collect()
            ->merge(EmployeeDocument::query()->pluck('path'))
            ->merge(JobApplicationDocument::query()->pluck('file_path'))
            ->merge(LeaveRequest::withoutGlobalScopes()->pluck('attachment_path'))
            ->merge($this->punchPhotoPaths())
            ->filter()
            ->unique()
            ->values();

        $moved = 0;
        $missing = 0;

        foreach ($paths as $path) {
            if ($private->exists($path)) {
                continue; // already secured on an earlier run
            }

            if (! $public->exists($path)) {
                $missing++;

                continue;
            }

            $this->line(($dry ? '[dry-run] would move ' : 'moved ') . $path);

            if (! $dry) {
                $private->put($path, $public->readStream($path));
                $public->delete($path);
            }

            $moved++;
        }

        $this->newLine();
        $this->info(($dry ? 'Would move' : 'Moved') . " {$moved} sensitive file(s) to the private disk.");

        if ($missing) {
            $this->warn("{$missing} referenced file(s) were on neither disk — the rows point at nothing.");
        }

        if (! $dry && $moved) {
            $this->warn('These files were previously reachable over HTTP. If this instance was ever public, treat them as disclosed.');
        }

        return self::SUCCESS;
    }

    /** Punch photos are stored as comma-separated path lists on the attendance row. */
    private function punchPhotoPaths(): array
    {
        return Attendance::withoutGlobalScopes()
            ->get(['clock_in_photos', 'clock_out_photos'])
            ->flatMap(fn ($row) => array_merge(
                explode(',', (string) $row->clock_in_photos),
                explode(',', (string) $row->clock_out_photos),
            ))
            ->map(fn ($p) => trim($p))
            ->filter()
            ->all();
    }
}
