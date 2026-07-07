<?php

return [
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
        'branches'        => ['label' => 'Branches',        'abilities' => ['view', 'create', 'edit', 'delete']],
        'billing'         => ['label' => 'Billing',         'abilities' => ['view', 'create', 'edit', 'delete', 'export']],
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
        'super_admin' => ['label' => 'SuperAdmin', 'all' => true],
        'hr_admin' => [
            'label' => 'HR Admin',
            'modules' => [
                'employees' => '*', 'attendance' => '*', 'leave' => '*',
                'service_credits' => '*', 'recruitment' => '*', 'events' => '*',
                'announcements' => '*', 'performance' => ['view', 'edit'],
                'payroll' => ['view', 'export'], 'analytics' => '*',
            ],
        ],
        'branch_manager' => [
            'label' => 'Branch Manager',
            'modules' => [
                'attendance' => ['view', 'approve', 'export'],
                'leave' => ['view', 'approve'], 'analytics' => ['view', 'export'],
                'employees' => ['view'], 'events' => ['view'],
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
];
