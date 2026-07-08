<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // A ledger of service-credit movements. Balance = approved earns − approved uses.
        Schema::create('service_credits', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->foreignId('branch_id')->constrained()->cascadeOnDelete();
            $table->string('entry_type', 10);            // earn | use
            $table->decimal('days', 4, 1);               // supports half-days
            $table->date('service_date');                // date of extra service (earn) or day covered (use)
            $table->text('reason')->nullable();
            $table->string('status', 20)->default('pending'); // pending | approved | rejected | cancelled
            $table->string('source', 12)->default('request'); // request | grant
            $table->foreignId('acted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('acted_at')->nullable();
            $table->string('remarks', 255)->nullable();
            $table->timestamps();
            $table->index(['branch_id', 'status']);
            $table->index(['employee_id', 'entry_type', 'status']);
            $table->index(['service_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('service_credits');
    }
};
