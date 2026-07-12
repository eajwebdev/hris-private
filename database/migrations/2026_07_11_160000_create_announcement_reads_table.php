<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Read receipts: one row the first time a user opens an announcement.
        Schema::create('announcement_reads', function (Blueprint $table) {
            $table->id();
            $table->foreignId('announcement_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->timestamp('read_at')->useCurrent();

            $table->unique(['announcement_id', 'user_id']);
            $table->index('announcement_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('announcement_reads');
    }
};
