<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\WorkSchedule;
use App\Support\PrivateFile;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;

class AttendanceService
{
    /**
     * Record a punch for an employee. Appends to the single daily row
     * (one-per-day, comma-separated), stores the compressed photo, and
     * recomputes the four-checkpoint metrics.
     *
     * @param  'in'|'out'  $type
     */
    public function punch(Employee $employee, string $type, array $payload): Attendance
    {
        $tz = $employee->branch?->timezone ?? config('app.timezone');
        $now = Carbon::now($tz);
        $date = $now->toDateString();
        $time = $now->format('H:i:s');

        $attendance = Attendance::withoutGlobalScopes()->firstOrNew([
            'employee_id' => $employee->id,
            'work_date' => $date,
        ]);
        $attendance->branch_id = $employee->branch_id;
        $attendance->source = $payload['source'] ?? 'web';

        $coord = isset($payload['lat'], $payload['lng'])
            ? round((float) $payload['lat'], 6) . '|' . round((float) $payload['lng'], 6)
            : '';

        $photoPath = '';
        if (($payload['photo'] ?? null) instanceof UploadedFile) {
            $photoPath = $payload['photo']->store(
                "attendance/{$employee->branch_id}/{$employee->id}/{$date}",
                PrivateFile::DISK
            );
        }

        if ($type === 'in') {
            $attendance->clock_ins = $this->append($attendance->clock_ins, $time);
            $attendance->clock_in_coords = $this->append($attendance->clock_in_coords, $coord);
            $attendance->clock_in_photos = $this->append($attendance->clock_in_photos, $photoPath);
        } else {
            $attendance->clock_outs = $this->append($attendance->clock_outs, $time);
            $attendance->clock_out_coords = $this->append($attendance->clock_out_coords, $coord);
            $attendance->clock_out_photos = $this->append($attendance->clock_out_photos, $photoPath);
        }

        $this->evaluate($attendance, WorkSchedule::forEmployee($employee));
        $attendance->save();

        return $attendance;
    }

    private function append(?string $existing, string $value): string
    {
        return $existing === null || $existing === '' ? $value : $existing . ',' . $value;
    }

    /**
     * Evaluate the daily row against the schedule's four checkpoints and
     * store the computed minutes + worked hours. Pairs punches in order:
     * 1st in → Morning IN, 1st out → Morning OUT, 2nd in → Afternoon IN,
     * last out → Afternoon OUT. Handles single-pair (no lunch) days.
     */
    public function evaluate(Attendance $a, ?WorkSchedule $schedule): void
    {
        $ins = $this->list($a->clock_ins);
        $outs = $this->list($a->clock_outs);

        // Worked hours = sum of paired (out - in).
        $worked = 0;
        $pairs = min(count($ins), count($outs));
        for ($i = 0; $i < $pairs; $i++) {
            $diff = $this->secs($outs[$i]) - $this->secs($ins[$i]);
            if ($diff > 0) {
                $worked += $diff;
            }
        }
        $a->worked_hours = round($worked / 3600, 2);
        $a->is_incomplete = count($ins) !== count($outs);

        // Reset then compute against checkpoints.
        $a->late_am_minutes = 0;
        $a->late_pm_minutes = 0;
        $a->early_out_minutes = 0;
        $a->undertime_minutes = 0;

        if (! $schedule) {
            return;
        }

        $grace = (int) $schedule->grace_minutes * 60;
        $mIn = $this->secs($schedule->morning_in);
        $mOut = $this->secs($schedule->morning_out);
        $aIn = $this->secs($schedule->afternoon_in);
        $aOut = $this->secs($schedule->afternoon_out);

        $firstIn = isset($ins[0]) ? $this->secs($ins[0]) : null;
        $firstOut = isset($outs[0]) ? $this->secs($outs[0]) : null;
        $secondIn = isset($ins[1]) ? $this->secs($ins[1]) : null;
        $lastOut = count($outs) ? $this->secs(end($outs)) : null;

        // Late (AM): first clock-in after Morning IN + grace.
        if ($firstIn !== null && $firstIn > $mIn + $grace) {
            $a->late_am_minutes = intdiv($firstIn - $mIn, 60);
        }

        // Undertime AM / early lunch out: first clock-out before Morning OUT,
        // only when there was a return punch (a genuine lunch break).
        if ($firstOut !== null && $secondIn !== null && $firstOut < $mOut) {
            $a->undertime_minutes = intdiv($mOut - $firstOut, 60);
        }

        // Late (PM): return clock-in after Afternoon IN + grace.
        if ($secondIn !== null && $secondIn > $aIn + $grace) {
            $a->late_pm_minutes = intdiv($secondIn - $aIn, 60);
        }

        // Early out: last clock-out before Afternoon OUT.
        if ($lastOut !== null && $lastOut < $aOut) {
            $a->early_out_minutes = intdiv($aOut - $lastOut, 60);
        }
    }

    private function list(?string $value): array
    {
        return $value === null || $value === '' ? [] : explode(',', $value);
    }

    private function secs(string $time): int
    {
        [$h, $m, $s] = array_pad(explode(':', $time), 3, 0);

        return ((int) $h) * 3600 + ((int) $m) * 60 + (int) $s;
    }
}
