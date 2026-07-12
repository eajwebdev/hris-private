<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // One appraisal of an employee for a review period.
        Schema::create('performance_reviews', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->foreignId('branch_id')->constrained()->cascadeOnDelete();
            $table->foreignId('reviewer_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('period_label', 60);          // e.g. "H1 2026", "Q3 2026"
            $table->date('period_start');
            $table->date('period_end');
            $table->string('status', 20)->default('draft'); // draft | submitted | acknowledged
            $table->decimal('overall_rating', 3, 2)->nullable(); // weighted 1.00–5.00, set on submit
            $table->string('recommendation', 30)->nullable();    // retain | promote | merit_increase | coaching | pip
            $table->text('strengths')->nullable();
            $table->text('improvements')->nullable();
            $table->text('employee_remarks')->nullable();   // filled by the employee on acknowledge
            $table->timestamp('submitted_at')->nullable();
            $table->timestamp('acknowledged_at')->nullable();
            $table->timestamps();

            // An employee is appraised once per period.
            $table->unique(['employee_id', 'period_label']);
            $table->index(['branch_id', 'status']);
        });

        // Weighted criteria (KPIs/competencies) that roll up into overall_rating.
        Schema::create('performance_goals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('performance_review_id')->constrained()->cascadeOnDelete();
            $table->string('title', 150);
            $table->text('description')->nullable();
            $table->unsignedSmallInteger('weight')->default(0); // percent; the review's weights sum to 100
            $table->unsignedTinyInteger('rating')->nullable();  // 1–5
            $table->text('comments')->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
            $table->index('performance_review_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('performance_goals');
        Schema::dropIfExists('performance_reviews');
    }
};
