<?php

namespace App\Models;

use App\Models\Concerns\BelongsToBranch;
use App\Support\PrivateFile;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Attendance extends Model
{
    use BelongsToBranch;

    protected $fillable = [
        'employee_id', 'branch_id', 'work_date',
        'clock_ins', 'clock_outs', 'clock_in_coords', 'clock_out_coords',
        'clock_in_photos', 'clock_out_photos',
        'late_am_minutes', 'late_pm_minutes', 'early_out_minutes', 'undertime_minutes',
        'worked_hours', 'is_incomplete', 'source', 'note',
    ];

    protected function casts(): array
    {
        return [
            'work_date' => 'date',
            'is_incomplete' => 'boolean',
            'worked_hours' => 'decimal:2',
        ];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    /** Split a comma-separated column into an array (empty => []). */
    private function split(?string $value): array
    {
        return $value === null || $value === '' ? [] : explode(',', $value);
    }

    /**
     * Ordered punches paired in/out, with coords + photos aligned.
     * Exposed as $attendance->punches.
     */
    public function getPunchesAttribute(): array
    {
        $ins = $this->split($this->clock_ins);
        $outs = $this->split($this->clock_outs);
        $inCoords = $this->split($this->clock_in_coords);
        $outCoords = $this->split($this->clock_out_coords);
        $inPhotos = $this->split($this->clock_in_photos);
        $outPhotos = $this->split($this->clock_out_photos);

        $pairs = [];
        $count = max(count($ins), count($outs));
        for ($i = 0; $i < $count; $i++) {
            $pairs[] = [
                'in' => $ins[$i] ?? null,
                'out' => $outs[$i] ?? null,
                'in_coord' => $inCoords[$i] ?? null,
                'out_coord' => $outCoords[$i] ?? null,
                // Photos of staff at their desk — private disk, signed link per render.
                'in_photo' => PrivateFile::url($inPhotos[$i] ?? null),
                'out_photo' => PrivateFile::url($outPhotos[$i] ?? null),
            ];
        }

        return $pairs;
    }

    /**
     * Daily Time Record view — the four checkpoints mapped by punch order:
     * 1st in → AM IN, 1st out → AM OUT, 2nd in → PM IN, 2nd out → PM OUT.
     */
    public function getDtrAttribute(): array
    {
        $ins = $this->split($this->clock_ins);
        $outs = $this->split($this->clock_outs);

        return [
            'am_in' => $ins[0] ?? null,
            'am_out' => $outs[0] ?? null,
            'pm_in' => $ins[1] ?? null,
            'pm_out' => $outs[1] ?? null,
        ];
    }

    /** The next sensible action for the employee today. */
    public function getNextActionAttribute(): string
    {
        $ins = count($this->split($this->clock_ins));
        $outs = count($this->split($this->clock_outs));

        return $ins > $outs ? 'out' : 'in';
    }
}
