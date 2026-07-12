<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('performance_reviews', function (Blueprint $table) {
            // Runs alongside the main draft → submitted → acknowledged flow rather
            // than inside it: HR can score with or without a self-appraisal.
            $table->string('self_appraisal_status', 12)->default('none')->after('status'); // none | pending | done
            $table->timestamp('self_appraisal_at')->nullable()->after('self_appraisal_status');
        });

        Schema::table('performance_goals', function (Blueprint $table) {
            $table->unsignedTinyInteger('self_rating')->nullable()->after('rating'); // 1–5, by the employee
            $table->text('self_comments')->nullable()->after('comments');
        });
    }

    public function down(): void
    {
        Schema::table('performance_goals', function (Blueprint $table) {
            $table->dropColumn(['self_rating', 'self_comments']);
        });

        Schema::table('performance_reviews', function (Blueprint $table) {
            $table->dropColumn(['self_appraisal_status', 'self_appraisal_at']);
        });
    }
};
