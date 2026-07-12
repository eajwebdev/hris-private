<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // A salary component is a user-defined column on the payslip: an earning
        // (allowance, bonus) or a deduction (SSS, loan). HR adds these at will —
        // nothing about the set is hardcoded.
        Schema::create('payroll_components', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained()->cascadeOnDelete(); // null = every branch
            $table->string('code', 30);
            $table->string('name', 80);
            $table->string('type', 10);               // earning | deduction
            $table->string('calc', 20);               // fixed | percent_basic | percent_gross
            $table->decimal('amount', 12, 4)->default(0); // peso amount, or percent when calc is percent_*
            $table->boolean('is_statutory')->default(false); // SSS/PhilHealth/Pag-IBIG/tax
            $table->boolean('is_active')->default(true);
            // Applies to everyone automatically; otherwise only to employees it is
            // explicitly assigned to.
            $table->boolean('applies_to_all')->default(true);
            $table->boolean('is_taxable')->default(true); // earnings only; informational
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->unique(['company_id', 'code']);
            $table->index(['company_id', 'type', 'is_active']);
        });

        // Per-employee assignment and/or amount override. A row here with a null
        // amount means "applies, at the component's default amount".
        Schema::create('employee_payroll_components', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->foreignId('payroll_component_id')->constrained()->cascadeOnDelete();
            $table->decimal('amount', 12, 4)->nullable(); // overrides the component default
            $table->boolean('is_active')->default(true);  // false = excluded even if applies_to_all
            $table->timestamps();

            $table->unique(['employee_id', 'payroll_component_id'], 'employee_component_unique');
        });

        // The resolved lines on a generated payslip — a snapshot, so editing a
        // component later never rewrites payroll that already ran.
        Schema::create('payslip_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('payslip_id')->constrained()->cascadeOnDelete();
            $table->string('code', 30);
            $table->string('name', 80);
            $table->string('type', 10);   // earning | deduction
            $table->decimal('amount', 12, 2);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index('payslip_id');
        });

        // Totals so the register and ESS don't have to re-sum the lines.
        Schema::table('payslips', function (Blueprint $table) {
            $table->decimal('total_earnings', 12, 2)->default(0)->after('gross_pay');
            $table->decimal('total_deductions', 12, 2)->default(0)->after('late_deduction');
        });
    }

    public function down(): void
    {
        Schema::table('payslips', function (Blueprint $table) {
            $table->dropColumn(['total_earnings', 'total_deductions']);
        });
        Schema::dropIfExists('payslip_lines');
        Schema::dropIfExists('employee_payroll_components');
        Schema::dropIfExists('payroll_components');
    }
};
