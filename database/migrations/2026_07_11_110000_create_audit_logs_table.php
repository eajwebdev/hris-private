<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Append-only trail: who changed what, when. Never updated, so there is
        // no `updated_at` — a mutable audit log is not an audit log.
        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();

            // The actor is kept as an id *and* a name snapshot: the log must still
            // read correctly after the user is deleted.
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('user_name', 120);

            $table->string('module', 40);            // employees | attendance | payroll | …
            $table->string('action', 30);            // created | updated | deleted | approved | …
            $table->string('subject_type', 120)->nullable(); // FQCN of the touched model
            $table->unsignedBigInteger('subject_id')->nullable();
            $table->string('subject_label', 160)->nullable(); // human name at the time
            $table->string('description', 255);

            // {"field": {"old": …, "new": …}} — only what actually changed.
            $table->json('changes')->nullable();

            $table->string('ip', 45)->nullable();
            $table->string('user_agent', 255)->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['company_id', 'created_at']);
            $table->index(['module', 'action']);
            $table->index(['subject_type', 'subject_id']);
            $table->index('user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_logs');
    }
};
