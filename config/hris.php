<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Tenant pinning
    |--------------------------------------------------------------------------
    | The public careers portal has no authenticated user and the app has no
    | host-based tenant routing, so it cannot infer which company it is serving.
    | Set HRIS_COMPANY_ID when more than one company row exists; with exactly one
    | (the norm for a single deployment) it resolves automatically.
    */
    'company_id' => env('HRIS_COMPANY_ID'),

    /*
    |--------------------------------------------------------------------------
    | Permission modules
    |--------------------------------------------------------------------------
    | Modules are the permission unit. Each exposes granular abilities. The
    | new-user / edit-user screen renders this list as a checklist; a preset
    | just pre-checks a sensible subset which can then be fine-tuned per user.
    */
    'abilities' => ['view', 'create', 'edit', 'delete', 'approve', 'export'],

    'modules' => [
        'employees'       => ['label' => 'Employees',       'abilities' => ['view', 'create', 'edit', 'delete', 'export']],
        'attendance'      => ['label' => 'Attendance',      'abilities' => ['view', 'create', 'edit', 'delete', 'approve', 'export']],
        'leave'           => ['label' => 'Leave',           'abilities' => ['view', 'create', 'edit', 'delete', 'approve', 'export']],
        'service_credits' => ['label' => 'Service Credits', 'abilities' => ['view', 'create', 'edit', 'delete', 'approve', 'export']],
        'recruitment'     => ['label' => 'Recruitment',     'abilities' => ['view', 'create', 'edit', 'delete', 'approve', 'export']],
        'events'          => ['label' => 'Events',          'abilities' => ['view', 'create', 'edit', 'delete', 'export']],
        'announcements'   => ['label' => 'Announcements',   'abilities' => ['view', 'create', 'edit', 'delete', 'export']],
        'performance'     => ['label' => 'Performance',     'abilities' => ['view', 'create', 'edit', 'delete', 'approve', 'export']],
        'payroll'         => ['label' => 'Payroll',         'abilities' => ['view', 'create', 'edit', 'delete', 'approve', 'export']],
        'analytics'       => ['label' => 'Analytics',       'abilities' => ['view', 'export']],
        'reports'         => ['label' => 'Reports',         'abilities' => ['view', 'export']],
        'branches'        => ['label' => 'Branches',        'abilities' => ['view', 'create', 'edit', 'delete']],
        'billing'         => ['label' => 'Billing',         'abilities' => ['view', 'create', 'edit', 'delete', 'export']],
        'users'           => ['label' => 'User Management', 'abilities' => ['view', 'create', 'edit', 'delete']],
        'settings'        => ['label' => 'Settings',        'abilities' => ['view', 'edit']],
    ],

    /*
    |--------------------------------------------------------------------------
    | Role presets
    |--------------------------------------------------------------------------
    | Named preset => default module/ability set. Seeded into permission_presets
    | but editable in Settings. '*' on a module grants every ability it exposes.
    */
    'presets' => [
        // SuperAdmin is the system owner/developer, not an HR role. It exists to
        // run the SaaS itself: set a tenant's billing plan and due date, and mark
        // subscription invoices paid. Tenant HR work is HR Admin's job.
        'super_admin' => ['label' => 'SuperAdmin', 'all' => true],
        'hr_admin' => [
            'label' => 'HR Admin',
            'modules' => [
                'employees' => '*', 'attendance' => '*', 'leave' => '*',
                'service_credits' => '*', 'recruitment' => '*', 'events' => '*',
                'announcements' => '*', 'performance' => ['view', 'edit'],
                // HR runs payroll end to end: components, periods, regenerate,
                // finalize (approve), export.
                'payroll' => '*', 'analytics' => '*',
                'reports' => '*',
                // Read-only on billing: HR must be able to see what the company
                // owes for the subscription and when it's due, but only the
                // SuperAdmin (owner) sets the plan/due date and records payment.
                'billing' => ['view'],
            ],
        ],
        'branch_manager' => [
            'label' => 'Branch Manager',
            'modules' => [
                'attendance' => ['view', 'approve', 'export'],
                'leave' => ['view', 'approve'], 'analytics' => ['view', 'export'],
                'employees' => ['view'], 'events' => ['view'],
                'reports' => ['view', 'export'],
            ],
        ],
        'supervisor' => [
            'label' => 'Supervisor / Team Lead',
            'modules' => [
                'attendance' => ['view'], 'leave' => ['view', 'approve'],
                'employees' => ['view'],
            ],
        ],
        'employee' => [
            'label' => 'Employee',
            'modules' => [], // ESS only — own data + public/company content
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Subscription billing (the tenant's fee for using this system)
    |--------------------------------------------------------------------------
    | Distinct from employee payroll. The tenant company pays the system owner
    | (SuperAdmin) on a cycle. HR is warned ahead of the due date and through a
    | grace period afterwards. Non-payment NEVER locks the tenant out — HRIS data
    | stays fully usable and the reminders simply escalate.
    */
    'billing' => [
        'remind_days_before' => 5, // First heads-up, this many days before due.
        'grace_days' => 5,         // Days after the due date before it reads as delinquent.
        'invoice_due_days' => 15,  // Default payment window on a generated invoice.
    ],
];
