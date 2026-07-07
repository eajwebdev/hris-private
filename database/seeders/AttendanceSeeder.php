<?php

namespace Database\Seeders;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\WorkSchedule;
use App\Services\AttendanceService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;

class AttendanceSeeder extends Seeder
{
    public function run(): void
    {
        $service = app(AttendanceService::class);
        $employees = Employee::withoutGlobalScopes()->whereIn('status', ['regular', 'probationary'])->get();

        // Last 5 working days of punches for a subset, plus "currently in" today.
        foreach (range(5, 1) as $daysAgo) {
            $date = Carbon::today()->subDays($daysAgo);
            if ($date->isWeekend()) {
                continue;
            }
            foreach ($employees as $emp) {
                if (rand(1, 100) > 82) {
                    continue; // ~18% absent
                }
                $this->makeDay($service, $emp, $date, true);
            }
        }

        // Today: about 60% clocked in (some still in for the who's-in board).
        $today = Carbon::today();
        if (! $today->isWeekend()) {
            foreach ($employees as $emp) {
                $roll = rand(1, 100);
                if ($roll > 60) {
                    continue;
                }
                $this->makeDay($service, $emp, $today, $roll <= 30); // half still clocked in
            }
        }
    }

    private function makeDay(AttendanceService $service, Employee $emp, Carbon $date, bool $complete): void
    {
        $schedule = WorkSchedule::forEmployee($emp);
        $lateAm = rand(1, 100) > 75 ? rand(5, 45) : 0; // 25% late

        $a = Attendance::withoutGlobalScopes()->firstOrNew(['employee_id' => $emp->id, 'work_date' => $date->toDateString()]);
        $a->branch_id = $emp->branch_id;

        $mIn = Carbon::parse($schedule->morning_in)->addMinutes($lateAm);
        $a->clock_ins = $mIn->format('H:i:s');
        $a->clock_in_coords = $this->coord($emp);
        $a->clock_in_photos = '';

        if ($complete) {
            $a->clock_ins .= ',' . Carbon::parse($schedule->afternoon_in)->addMinutes(rand(-3, 8))->format('H:i:s');
            $a->clock_in_coords .= ',' . $this->coord($emp);
            $a->clock_in_photos = ',';
            $a->clock_outs = Carbon::parse($schedule->morning_out)->addMinutes(rand(-2, 5))->format('H:i:s')
                . ',' . Carbon::parse($schedule->afternoon_out)->addMinutes(rand(-15, 30))->format('H:i:s');
            $a->clock_out_coords = $this->coord($emp) . ',' . $this->coord($emp);
            $a->clock_out_photos = ',';
        }

        $service->evaluate($a, $schedule);
        $a->save();
    }

    private function coord(Employee $emp): string
    {
        $lat = ($emp->branch->latitude ?? 14.55) + (rand(-8, 8) / 10000);
        $lng = ($emp->branch->longitude ?? 121.02) + (rand(-8, 8) / 10000);

        return round($lat, 6) . '|' . round($lng, 6);
    }
}
