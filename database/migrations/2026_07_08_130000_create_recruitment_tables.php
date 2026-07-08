<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('job_openings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('position_id')->nullable()->constrained()->nullOnDelete();
            $table->string('title', 150);
            $table->string('slug', 180)->unique();
            $table->string('department', 120)->nullable();
            $table->string('employment_type', 30)->default('full_time');
            $table->string('location', 150)->nullable();
            $table->string('salary_range', 80)->nullable();
            $table->unsignedSmallInteger('openings_count')->default(1);
            $table->text('description')->nullable();
            $table->string('status', 20)->default('open'); // open|closed|draft
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('published_at')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->index(['company_id', 'status']);
        });

        // The flexible required-documents checklist per opening (HR editable).
        Schema::create('job_opening_requirements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('job_opening_id')->constrained()->cascadeOnDelete();
            $table->string('name', 120);
            $table->string('description', 255)->nullable();
            $table->boolean('is_required')->default(true);
            $table->unsignedSmallInteger('sort')->default(0);
            $table->timestamps();
        });

        Schema::create('job_applications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('job_opening_id')->constrained()->cascadeOnDelete();
            $table->string('first_name', 80);
            $table->string('last_name', 80);
            $table->string('email', 150);
            $table->string('phone', 40)->nullable();
            $table->text('cover_letter')->nullable();
            $table->string('status', 20)->default('applied'); // applied|screening|interview|offer|hired|rejected|withdrawn
            $table->unsignedTinyInteger('rating')->nullable(); // 1..5
            $table->text('hr_notes')->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();
            $table->index(['job_opening_id', 'status']);
        });

        Schema::create('job_application_documents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('job_application_id')->constrained()->cascadeOnDelete();
            $table->foreignId('job_opening_requirement_id')->nullable()->constrained()->nullOnDelete();
            $table->string('label', 120);
            $table->string('file_path', 255);
            $table->string('original_name', 200)->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('job_application_documents');
        Schema::dropIfExists('job_applications');
        Schema::dropIfExists('job_opening_requirements');
        Schema::dropIfExists('job_openings');
    }
};
