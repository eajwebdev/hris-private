<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leave_requests', function (Blueprint $table) {
            // Only meaningful on a single-day request: 'am' | 'pm'.
            $table->string('half_day', 2)->nullable()->after('date_to');
            $table->string('attachment_path')->nullable()->after('reason');
            $table->string('attachment_name', 160)->nullable()->after('attachment_path');
            // Which approval step the request is waiting on. Null once it's settled.
            $table->unsignedTinyInteger('current_level')->nullable()->after('status');
        });

        // The approval chain: one row per step, in order. A request is only
        // approved once every level has approved; any rejection ends it.
        Schema::create('leave_approvals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('leave_request_id')->constrained()->cascadeOnDelete();
            $table->unsignedTinyInteger('level');            // 1, 2, …
            $table->string('role', 30);                      // supervisor | hr
            $table->string('label', 60);                     // shown in the timeline
            // Who *must* act, when it's a specific person (the employee's manager).
            // Null means "anyone holding leave.approve".
            $table->foreignId('approver_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('acted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('status', 20)->default('pending'); // pending | approved | rejected | skipped
            $table->string('remarks', 255)->nullable();
            $table->timestamp('acted_at')->nullable();
            $table->timestamps();

            $table->unique(['leave_request_id', 'level']);
            $table->index(['approver_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('leave_approvals');

        Schema::table('leave_requests', function (Blueprint $table) {
            $table->dropColumn(['half_day', 'attachment_path', 'attachment_name', 'current_level']);
        });
    }
};
