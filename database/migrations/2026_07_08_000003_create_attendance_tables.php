<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Named four-checkpoint schedules, assignable to branch / department / employee.
        Schema::create('work_schedules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('branch_id')->nullable()->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->time('morning_in')->default('08:00');
            $table->time('morning_out')->default('12:00');
            $table->time('afternoon_in')->default('13:00');
            $table->time('afternoon_out')->default('17:00');
            $table->unsignedSmallInteger('grace_minutes')->default(0); // applied to AM/PM IN
            $table->boolean('is_default')->default(false);
            $table->timestamps();
        });

        Schema::create('holidays', function (Blueprint $table) {
            $table->id();
            $table->foreignId('branch_id')->nullable()->constrained()->cascadeOnDelete();
            $table->date('date');
            $table->string('name');
            $table->string('type')->default('regular'); // regular / special
            $table->timestamps();
        });

        // One row per employee per day. Multi-value columns are comma-separated,
        // appended in punch order (see EAJ build prompt §4.2).
        Schema::create('attendances', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->foreignId('branch_id')->constrained()->cascadeOnDelete();
            $table->date('work_date');

            $table->text('clock_ins')->nullable();          // "08:02:11,13:04:55"
            $table->text('clock_outs')->nullable();         // "12:00:03,17:31:20"
            $table->text('clock_in_coords')->nullable();    // "10.50,123.41|10.50,123.42"
            $table->text('clock_out_coords')->nullable();
            $table->text('clock_in_photos')->nullable();    // comma-separated paths
            $table->text('clock_out_photos')->nullable();

            // Computed on each punch so reports/payroll can total tardiness.
            $table->unsignedSmallInteger('late_am_minutes')->default(0);
            $table->unsignedSmallInteger('late_pm_minutes')->default(0);
            $table->unsignedSmallInteger('early_out_minutes')->default(0);
            $table->unsignedSmallInteger('undertime_minutes')->default(0);
            $table->decimal('worked_hours', 6, 2)->default(0);
            $table->boolean('is_incomplete')->default(false); // unpaired punch
            $table->string('source')->default('web');
            $table->text('note')->nullable();                 // manual correction reason

            $table->timestamps();
            $table->unique(['employee_id', 'work_date']);
            $table->index(['branch_id', 'work_date']);
        });

        // Link employees to a schedule (added here to avoid touching employees migration).
        Schema::table('employees', function (Blueprint $table) {
            $table->foreign('work_schedule_id')->references('id')->on('work_schedules')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->dropForeign(['work_schedule_id']);
        });
        Schema::dropIfExists('attendances');
        Schema::dropIfExists('holidays');
        Schema::dropIfExists('work_schedules');
    }
};
