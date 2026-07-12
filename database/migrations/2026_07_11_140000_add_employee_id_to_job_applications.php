<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('job_applications', function (Blueprint $table) {
            // Set when a hired applicant is turned into a 201 record. Its presence
            // is what stops the same person being converted twice.
            $table->foreignId('employee_id')->nullable()->after('reviewed_at')
                ->constrained()->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('job_applications', function (Blueprint $table) {
            $table->dropConstrainedForeignId('employee_id');
        });
    }
};
