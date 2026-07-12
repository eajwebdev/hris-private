<?php

namespace App\Services;

use App\Models\Announcement;
use App\Models\Attendance;
use App\Models\Branch;
use App\Models\Department;
use App\Models\Employee;
use App\Models\Event;
use App\Models\Invoice;
use App\Models\JobApplication;
use App\Models\JobOpening;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Models\PayrollPeriod;
use App\Models\Payslip;
use App\Models\ServiceCredit;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;

/**
 * Every module exposes one printable report. A report is a *definition*
 * (label + module gate + filter schema) plus a `build*` method that turns the
 * submitted filters into a flat payload: columns, rows, summary tiles.
 *
 * The payload is medium-agnostic — the Blade view renders it to PDF, and the
 * same structure is what the SPA would need if we ever add an on-screen table.
 * Rows are pre-formatted strings so neither the view nor the client has to
 * know anything about the underlying model.
 */
class ReportService
{
    /** Hard cap so a careless filter can't try to render a 50k-row PDF. */
    private const MAX_ROWS = 2000;

    /**
     * Static half of each report: which module gates it, and what it asks for.
     * `options` on a select filter are filled in by definitions() at request
     * time because they depend on the caller's branch scope.
     */
    private const REPORTS = [
        'employees.masterlist' => [
            'label' => 'Employee Masterlist',
            'module' => 'employees',
            'description' => 'Every employee on file with position, branch and employment status.',
            'orientation' => 'landscape',
            'filters' => ['branch_id', 'department_id', 'employment_type', 'employee_status'],
        ],
        'attendance.dtr' => [
            'label' => 'Daily Time Record',
            'module' => 'attendance',
            'description' => 'Per-day punches, tardiness and hours worked over a date range.',
            'orientation' => 'landscape',
            'filters' => ['branch_id', 'employee_id', 'from', 'to'],
        ],
        'leave.requests' => [
            'label' => 'Leave Requests',
            'module' => 'leave',
            'description' => 'Filed leave with type, inclusive dates, days and approval status.',
            'orientation' => 'portrait',
            'filters' => ['branch_id', 'employee_id', 'leave_type_id', 'request_status', 'from', 'to'],
        ],
        'service_credits.ledger' => [
            'label' => 'Service Credit Ledger',
            'module' => 'service_credits',
            'description' => 'Credits earned and used, with the resulting net balance.',
            'orientation' => 'portrait',
            'filters' => ['branch_id', 'employee_id', 'entry_type', 'request_status', 'from', 'to'],
        ],
        'payroll.register' => [
            'label' => 'Payroll Register',
            'module' => 'payroll',
            'description' => 'Payslip breakdown for one payroll period, with gross, deductions and net.',
            'orientation' => 'landscape',
            'filters' => ['payroll_period_id', 'branch_id'],
        ],
        'recruitment.applications' => [
            'label' => 'Job Applications',
            'module' => 'recruitment',
            'description' => 'Applicants per opening with pipeline stage, rating and applied date.',
            'orientation' => 'landscape',
            'filters' => ['job_opening_id', 'application_status', 'from', 'to'],
        ],
        'events.schedule' => [
            'label' => 'Events Schedule',
            'module' => 'events',
            'description' => 'Company and branch events within a date range.',
            'orientation' => 'portrait',
            'filters' => ['branch_id', 'from', 'to'],
        ],
        'announcements.log' => [
            'label' => 'Announcements Log',
            'module' => 'announcements',
            'description' => 'Published announcements with priority and author.',
            'orientation' => 'portrait',
            'filters' => ['branch_id', 'priority', 'from', 'to'],
        ],
        'billing.statement' => [
            'label' => 'Billing Statement',
            'module' => 'billing',
            'description' => 'Invoices issued to your company with paid and outstanding totals.',
            'orientation' => 'portrait',
            'filters' => ['invoice_status', 'from', 'to'],
        ],
    ];

    /** Reports the user may run, with their filter schema resolved. */
    public function definitions(User $user): array
    {
        $out = [];

        foreach (self::REPORTS as $key => $def) {
            if (! $user->canModule($def['module'], 'view')) {
                continue;
            }

            $out[] = [
                'key' => $key,
                'label' => $def['label'],
                'module' => $def['module'],
                'description' => $def['description'],
                'can_export' => $user->canModule('reports', 'export'),
                'filters' => array_values(array_map(
                    fn (string $name) => $this->filter($name, $user),
                    $def['filters']
                )),
            ];
        }

        return $out;
    }

    public function exists(string $key): bool
    {
        return isset(self::REPORTS[$key]);
    }

    public function definition(string $key): array
    {
        return self::REPORTS[$key];
    }

    /** Build the printable payload for a report. `$filters` is already validated. */
    public function build(string $key, array $filters, User $user): array
    {
        $method = 'build' . str_replace(' ', '', ucwords(str_replace(['.', '_'], ' ', $key)));
        $payload = $this->{$method}($filters, $user);

        $def = self::REPORTS[$key];

        return [
            'title' => $def['label'],
            'description' => $def['description'],
            'orientation' => $def['orientation'],
            'applied' => $this->appliedLabels($def['filters'], $filters, $user),
            'columns' => $payload['columns'],
            'rows' => array_slice($payload['rows'], 0, self::MAX_ROWS),
            'total' => count($payload['rows']),
            'truncated' => max(0, count($payload['rows']) - self::MAX_ROWS),
            'summary' => $payload['summary'] ?? [],
        ];
    }

    /** A slug-safe filename, e.g. "daily-time-record-2026-07-08.csv". */
    public function filename(string $key, string $format = 'pdf'): string
    {
        return str($this->definition($key)['label'])->slug() . '-' . now()->format('Y-m-d') . '.' . $format;
    }

    /**
     * The same payload as a CSV. Built from `columns`/`rows`, so a report only
     * ever has to be written once and both media fall out of it.
     *
     * The summary tiles are appended as trailing key/value rows — a spreadsheet
     * has nowhere else to put them, and dropping them would lose the totals.
     */
    public function toCsv(array $report): string
    {
        $handle = fopen('php://temp', 'r+');

        // Excel reads a bare UTF-8 CSV as Windows-1252 and mangles the peso sign
        // and en-dashes; the BOM is what tells it otherwise.
        fwrite($handle, "\u{FEFF}");

        fputcsv($handle, array_column($report['columns'], 'label'));

        foreach ($report['rows'] as $row) {
            fputcsv($handle, $row);
        }

        if (! empty($report['summary'])) {
            fputcsv($handle, []);
            foreach ($report['summary'] as $tile) {
                fputcsv($handle, [$tile['label'], $tile['value']]);
            }
        }

        if (! empty($report['truncated'])) {
            fputcsv($handle, []);
            fputcsv($handle, ['Note', $report['truncated'] . ' further row(s) were omitted — narrow the filters to see them.']);
        }

        rewind($handle);
        $csv = stream_get_contents($handle);
        fclose($handle);

        return $csv;
    }

    // -- Filter schema -------------------------------------------------------

    /**
     * One filter's schema. Selects always allow "All" (an empty value) except
     * payroll_period_id, which has nothing sensible to show without a period.
     */
    private function filter(string $name, User $user): array
    {
        $monthStart = now()->startOfMonth()->toDateString();
        $today = now()->toDateString();

        return match ($name) {
            'branch_id' => [
                'name' => 'branch_id', 'label' => 'Branch', 'type' => 'select', 'placeholder' => 'All branches',
                'options' => Branch::whereIn('id', $user->accessibleBranchIds())->orderBy('name')
                    ->get(['id', 'name'])->map(fn ($b) => ['value' => (string) $b->id, 'label' => $b->name])->all(),
            ],
            'employee_id' => [
                'name' => 'employee_id', 'label' => 'Employee', 'type' => 'select', 'placeholder' => 'All employees',
                'options' => Employee::orderBy('last_name')->get(['id', 'first_name', 'last_name'])
                    ->map(fn ($e) => ['value' => (string) $e->id, 'label' => $e->full_name])->all(),
            ],
            'department_id' => [
                'name' => 'department_id', 'label' => 'Department', 'type' => 'select', 'placeholder' => 'All departments',
                'options' => Department::orderBy('name')->get(['id', 'name'])
                    ->map(fn ($d) => ['value' => (string) $d->id, 'label' => $d->name])->all(),
            ],
            'leave_type_id' => [
                'name' => 'leave_type_id', 'label' => 'Leave type', 'type' => 'select', 'placeholder' => 'All types',
                'options' => LeaveType::orderBy('name')->get(['id', 'name'])
                    ->map(fn ($t) => ['value' => (string) $t->id, 'label' => $t->name])->all(),
            ],
            'payroll_period_id' => [
                'name' => 'payroll_period_id', 'label' => 'Payroll period', 'type' => 'select', 'required' => true,
                'placeholder' => 'Select a period',
                'options' => $this->scopeToBranches(PayrollPeriod::query(), $user)
                    ->with('branch')->orderByDesc('period_start')->limit(50)->get()
                    ->map(fn ($p) => [
                        'value' => (string) $p->id,
                        'label' => $this->d($p->period_start) . ' – ' . $this->d($p->period_end)
                            . ($p->branch ? ' · ' . $p->branch->name : '') . ' (' . ucfirst($p->status) . ')',
                    ])->all(),
            ],
            'job_opening_id' => [
                'name' => 'job_opening_id', 'label' => 'Job opening', 'type' => 'select', 'placeholder' => 'All openings',
                'options' => $this->scopeToBranches(JobOpening::query(), $user, nullable: true)
                    ->orderByDesc('created_at')->get(['id', 'title'])
                    ->map(fn ($o) => ['value' => (string) $o->id, 'label' => $o->title])->all(),
            ],
            'employment_type' => $this->options('employment_type', 'Employment type', 'All types', [
                'full_time' => 'Full-time', 'part_time' => 'Part-time', 'contract' => 'Contract',
            ]),
            'employee_status' => $this->options('employee_status', 'Employment status', 'All statuses', [
                'probationary' => 'Probationary', 'regular' => 'Regular',
                'resigned' => 'Resigned', 'terminated' => 'Terminated',
            ]),
            'request_status' => $this->options('request_status', 'Status', 'All statuses', [
                'pending' => 'Pending', 'approved' => 'Approved',
                'rejected' => 'Rejected', 'cancelled' => 'Cancelled',
            ]),
            'entry_type' => $this->options('entry_type', 'Entry type', 'Earned and used', [
                'earn' => 'Earned', 'use' => 'Used',
            ]),
            'application_status' => $this->options('application_status', 'Stage', 'All stages',
                array_combine(JobApplication::STATUSES, array_map('ucfirst', JobApplication::STATUSES))),
            'invoice_status' => $this->options('invoice_status', 'Status', 'All statuses', [
                'paid' => 'Paid', 'unpaid' => 'Unpaid', 'overdue' => 'Overdue', 'void' => 'Void',
            ]),
            'priority' => $this->options('priority', 'Priority', 'All priorities', [
                'normal' => 'Normal', 'high' => 'High',
            ]),
            'from' => ['name' => 'from', 'label' => 'From', 'type' => 'date', 'default' => $monthStart],
            'to' => ['name' => 'to', 'label' => 'To', 'type' => 'date', 'default' => $today],
        };
    }

    /** @param array<string, string> $map value => label */
    private function options(string $name, string $label, string $placeholder, array $map): array
    {
        return [
            'name' => $name, 'label' => $label, 'type' => 'select', 'placeholder' => $placeholder,
            'options' => collect($map)->map(fn ($l, $v) => ['value' => $v, 'label' => $l])->values()->all(),
        ];
    }

    /** Human-readable "Branch: Makati · From: Jul 1, 2026" chips for the PDF header. */
    private function appliedLabels(array $names, array $filters, User $user): array
    {
        $chips = [];

        foreach ($names as $name) {
            $value = $filters[$name] ?? null;
            if ($value === null || $value === '') {
                continue;
            }

            $schema = $this->filter($name, $user);

            if ($schema['type'] === 'date') {
                $chips[] = ['label' => $schema['label'], 'value' => $this->d($value)];

                continue;
            }

            $match = collect($schema['options'])->firstWhere('value', (string) $value);
            $chips[] = ['label' => $schema['label'], 'value' => $match['label'] ?? (string) $value];
        }

        return $chips;
    }

    // -- Builders ------------------------------------------------------------

    private function buildEmployeesMasterlist(array $f, User $user): array
    {
        $employees = Employee::with('department', 'position', 'branch')
            ->when($f['branch_id'] ?? null, fn ($q, $v) => $q->where('branch_id', $v))
            ->when($f['department_id'] ?? null, fn ($q, $v) => $q->where('department_id', $v))
            ->when($f['employment_type'] ?? null, fn ($q, $v) => $q->where('employment_type', $v))
            ->when($f['employee_status'] ?? null, fn ($q, $v) => $q->where('status', $v))
            ->orderBy('last_name')->orderBy('first_name')
            ->get();

        $rows = $employees->map(fn (Employee $e) => [
            $e->employee_no ?? '—',
            $e->full_name,
            $e->position?->title ?? '—',
            $e->department?->name ?? '—',
            $e->branch?->name ?? '—',
            $this->titleize($e->employment_type),
            $this->titleize($e->status),
            $this->d($e->date_hired),
        ])->all();

        $byStatus = $employees->countBy('status');

        return [
            'columns' => [
                ['label' => 'Emp. No.'], ['label' => 'Name'], ['label' => 'Position'], ['label' => 'Department'],
                ['label' => 'Branch'], ['label' => 'Type'], ['label' => 'Status'], ['label' => 'Date Hired'],
            ],
            'rows' => $rows,
            'summary' => [
                ['label' => 'Total employees', 'value' => (string) $employees->count()],
                ['label' => 'Regular', 'value' => (string) ($byStatus['regular'] ?? 0)],
                ['label' => 'Probationary', 'value' => (string) ($byStatus['probationary'] ?? 0)],
                ['label' => 'Separated', 'value' => (string) (($byStatus['resigned'] ?? 0) + ($byStatus['terminated'] ?? 0))],
            ],
        ];
    }

    private function buildAttendanceDtr(array $f, User $user): array
    {
        $records = Attendance::with('employee')
            ->when($f['branch_id'] ?? null, fn ($q, $v) => $q->where('branch_id', $v))
            ->when($f['employee_id'] ?? null, fn ($q, $v) => $q->where('employee_id', $v))
            ->when($f['from'] ?? null, fn ($q, $v) => $q->whereDate('work_date', '>=', $v))
            ->when($f['to'] ?? null, fn ($q, $v) => $q->whereDate('work_date', '<=', $v))
            ->orderBy('work_date')->orderBy('employee_id')
            ->get();

        $rows = $records->map(function (Attendance $a) {
            $dtr = $a->dtr;
            $late = (int) $a->late_am_minutes + (int) $a->late_pm_minutes;

            return [
                $this->d($a->work_date),
                $a->employee?->full_name ?? '—',
                $this->t($dtr['am_in']), $this->t($dtr['am_out']),
                $this->t($dtr['pm_in']), $this->t($dtr['pm_out']),
                $late ? $late . 'm' : '—',
                (int) $a->undertime_minutes ? $a->undertime_minutes . 'm' : '—',
                number_format((float) $a->worked_hours, 2),
                $a->is_incomplete ? 'Incomplete' : 'Complete',
            ];
        })->all();

        $totalLate = $records->sum(fn ($a) => (int) $a->late_am_minutes + (int) $a->late_pm_minutes);

        return [
            'columns' => [
                ['label' => 'Date'], ['label' => 'Employee'],
                ['label' => 'AM In'], ['label' => 'AM Out'], ['label' => 'PM In'], ['label' => 'PM Out'],
                ['label' => 'Late', 'align' => 'right'], ['label' => 'Undertime', 'align' => 'right'],
                ['label' => 'Hours', 'align' => 'right'], ['label' => 'Record'],
            ],
            'rows' => $rows,
            'summary' => [
                ['label' => 'Days recorded', 'value' => (string) $records->count()],
                ['label' => 'Total hours worked', 'value' => number_format((float) $records->sum('worked_hours'), 2)],
                ['label' => 'Total tardiness', 'value' => $this->minutes($totalLate)],
                ['label' => 'Incomplete records', 'value' => (string) $records->where('is_incomplete', true)->count()],
            ],
        ];
    }

    private function buildLeaveRequests(array $f, User $user): array
    {
        $requests = LeaveRequest::with('employee', 'type')
            ->when($f['branch_id'] ?? null, fn ($q, $v) => $q->where('branch_id', $v))
            ->when($f['employee_id'] ?? null, fn ($q, $v) => $q->where('employee_id', $v))
            ->when($f['leave_type_id'] ?? null, fn ($q, $v) => $q->where('leave_type_id', $v))
            ->when($f['request_status'] ?? null, fn ($q, $v) => $q->where('status', $v))
            ->when($f['from'] ?? null, fn ($q, $v) => $q->whereDate('date_from', '>=', $v))
            ->when($f['to'] ?? null, fn ($q, $v) => $q->whereDate('date_to', '<=', $v))
            ->orderByDesc('date_from')
            ->get();

        $rows = $requests->map(fn (LeaveRequest $r) => [
            $r->employee?->full_name ?? '—',
            $r->type?->name ?? '—',
            $this->d($r->date_from),
            $this->d($r->date_to),
            number_format((float) $r->days, 1),
            $this->titleize($r->status),
            $this->d($r->created_at),
        ])->all();

        $byStatus = $requests->countBy('status');

        return [
            'columns' => [
                ['label' => 'Employee'], ['label' => 'Leave Type'], ['label' => 'From'], ['label' => 'To'],
                ['label' => 'Days', 'align' => 'right'], ['label' => 'Status'], ['label' => 'Filed'],
            ],
            'rows' => $rows,
            'summary' => [
                ['label' => 'Total requests', 'value' => (string) $requests->count()],
                ['label' => 'Approved days', 'value' => number_format((float) $requests->where('status', 'approved')->sum('days'), 1)],
                ['label' => 'Pending', 'value' => (string) ($byStatus['pending'] ?? 0)],
                ['label' => 'Rejected', 'value' => (string) ($byStatus['rejected'] ?? 0)],
            ],
        ];
    }

    private function buildServiceCreditsLedger(array $f, User $user): array
    {
        $entries = ServiceCredit::with('employee')
            ->when($f['branch_id'] ?? null, fn ($q, $v) => $q->where('branch_id', $v))
            ->when($f['employee_id'] ?? null, fn ($q, $v) => $q->where('employee_id', $v))
            ->when($f['entry_type'] ?? null, fn ($q, $v) => $q->where('entry_type', $v))
            ->when($f['request_status'] ?? null, fn ($q, $v) => $q->where('status', $v))
            ->when($f['from'] ?? null, fn ($q, $v) => $q->whereDate('service_date', '>=', $v))
            ->when($f['to'] ?? null, fn ($q, $v) => $q->whereDate('service_date', '<=', $v))
            ->orderByDesc('service_date')
            ->get();

        $rows = $entries->map(fn (ServiceCredit $c) => [
            $this->d($c->service_date),
            $c->employee?->full_name ?? '—',
            $c->entry_type === 'earn' ? 'Earned' : 'Used',
            number_format((float) $c->days, 1),
            $c->reason ?: '—',
            $this->titleize($c->status),
        ])->all();

        // Only approved entries move the balance — mirrors ServiceCredit::balanceFor().
        $approved = $entries->where('status', 'approved');
        $earned = (float) $approved->where('entry_type', 'earn')->sum('days');
        $used = (float) $approved->where('entry_type', 'use')->sum('days');

        return [
            'columns' => [
                ['label' => 'Service Date'], ['label' => 'Employee'], ['label' => 'Entry'],
                ['label' => 'Days', 'align' => 'right'], ['label' => 'Reason'], ['label' => 'Status'],
            ],
            'rows' => $rows,
            'summary' => [
                ['label' => 'Entries', 'value' => (string) $entries->count()],
                ['label' => 'Approved earned', 'value' => number_format($earned, 1)],
                ['label' => 'Approved used', 'value' => number_format($used, 1)],
                ['label' => 'Net credits', 'value' => number_format($earned - $used, 1)],
            ],
        ];
    }

    private function buildPayrollRegister(array $f, User $user): array
    {
        $period = $this->scopeToBranches(PayrollPeriod::query(), $user)
            ->with('branch')->findOrFail($f['payroll_period_id']);

        $payslips = Payslip::with('employee')
            ->where('payroll_period_id', $period->id)
            ->whereIn('branch_id', $user->accessibleBranchIds())
            ->when($f['branch_id'] ?? null, fn ($q, $v) => $q->where('branch_id', $v))
            ->get()
            ->sortBy(fn ($p) => $p->employee?->last_name)
            ->values();

        // Gross on the register means everything earned — base pay plus the
        // employee's earning components. Deductions are already totalled on the
        // payslip (tardiness + every deduction component).
        $rows = $payslips->map(fn (Payslip $p) => [
            $p->employee?->employee_no ?? '—',
            $p->employee?->full_name ?? '—',
            $this->money($p->basic_salary),
            number_format((float) $p->days_present, 1),
            number_format((float) $p->paid_leave_days, 1),
            number_format((float) $p->service_credit_days, 1),
            $this->money((float) $p->gross_pay + (float) $p->total_earnings),
            $this->money($p->total_deductions),
            $this->money($p->net_pay),
        ])->all();

        $grossTotal = $payslips->sum(fn (Payslip $p) => (float) $p->gross_pay + (float) $p->total_earnings);

        return [
            'columns' => [
                ['label' => 'Emp. No.'], ['label' => 'Employee'],
                ['label' => 'Basic', 'align' => 'right'], ['label' => 'Days', 'align' => 'right'],
                ['label' => 'Paid Leave', 'align' => 'right'], ['label' => 'Credits', 'align' => 'right'],
                ['label' => 'Gross', 'align' => 'right'], ['label' => 'Deductions', 'align' => 'right'],
                ['label' => 'Net Pay', 'align' => 'right'],
            ],
            'rows' => $rows,
            'summary' => [
                ['label' => 'Payslips', 'value' => (string) $payslips->count()],
                ['label' => 'Total gross', 'value' => $this->money($grossTotal)],
                ['label' => 'Total deductions', 'value' => $this->money($payslips->sum('total_deductions'))],
                ['label' => 'Total net pay', 'value' => $this->money($payslips->sum('net_pay'))],
            ],
        ];
    }

    private function buildRecruitmentApplications(array $f, User $user): array
    {
        $openingIds = $this->scopeToBranches(JobOpening::query(), $user, nullable: true)->pluck('id');

        $applications = JobApplication::with('opening')
            ->whereIn('job_opening_id', $openingIds)
            ->when($f['job_opening_id'] ?? null, fn ($q, $v) => $q->where('job_opening_id', $v))
            ->when($f['application_status'] ?? null, fn ($q, $v) => $q->where('status', $v))
            ->when($f['from'] ?? null, fn ($q, $v) => $q->whereDate('created_at', '>=', $v))
            ->when($f['to'] ?? null, fn ($q, $v) => $q->whereDate('created_at', '<=', $v))
            ->orderByDesc('created_at')
            ->get();

        $rows = $applications->map(fn (JobApplication $a) => [
            $a->full_name,
            $a->opening?->title ?? '—',
            $a->email,
            $a->phone ?: '—',
            $this->titleize($a->status),
            $a->rating ? $a->rating . '/5' : '—',
            $this->d($a->created_at),
        ])->all();

        $byStatus = $applications->countBy('status');

        return [
            'columns' => [
                ['label' => 'Applicant'], ['label' => 'Opening'], ['label' => 'Email'], ['label' => 'Phone'],
                ['label' => 'Stage'], ['label' => 'Rating', 'align' => 'right'], ['label' => 'Applied'],
            ],
            'rows' => $rows,
            'summary' => [
                ['label' => 'Applications', 'value' => (string) $applications->count()],
                ['label' => 'In pipeline', 'value' => (string) $applications->whereIn('status', ['applied', 'screening', 'interview', 'offer'])->count()],
                ['label' => 'Hired', 'value' => (string) ($byStatus['hired'] ?? 0)],
                ['label' => 'Rejected', 'value' => (string) ($byStatus['rejected'] ?? 0)],
            ],
        ];
    }

    private function buildEventsSchedule(array $f, User $user): array
    {
        $events = $this->scopeToBranches(Event::query(), $user, nullable: true)
            ->with('branch', 'creator')
            ->when($f['branch_id'] ?? null, fn ($q, $v) => $q->where('branch_id', $v))
            ->when($f['from'] ?? null, fn ($q, $v) => $q->whereDate('starts_at', '>=', $v))
            ->when($f['to'] ?? null, fn ($q, $v) => $q->whereDate('starts_at', '<=', $v))
            ->orderBy('starts_at')
            ->get();

        $rows = $events->map(fn (Event $e) => [
            $e->title,
            $e->all_day ? $this->d($e->starts_at) . ' (all day)' : $this->dt($e->starts_at),
            $e->ends_at ? ($e->all_day ? $this->d($e->ends_at) : $this->dt($e->ends_at)) : '—',
            $e->location ?: '—',
            $e->branch?->name ?? 'Company-wide',
            $e->creator?->name ?? '—',
        ])->all();

        return [
            'columns' => [
                ['label' => 'Event'], ['label' => 'Starts'], ['label' => 'Ends'],
                ['label' => 'Location'], ['label' => 'Audience'], ['label' => 'Created by'],
            ],
            'rows' => $rows,
            'summary' => [
                ['label' => 'Events', 'value' => (string) $events->count()],
                ['label' => 'Company-wide', 'value' => (string) $events->whereNull('branch_id')->count()],
                ['label' => 'All-day', 'value' => (string) $events->where('all_day', true)->count()],
            ],
        ];
    }

    private function buildAnnouncementsLog(array $f, User $user): array
    {
        $announcements = $this->scopeToBranches(Announcement::query(), $user, nullable: true)
            ->with('branch', 'creator')
            ->when($f['branch_id'] ?? null, fn ($q, $v) => $q->where('branch_id', $v))
            ->when($f['priority'] ?? null, fn ($q, $v) => $q->where('priority', $v))
            ->when($f['from'] ?? null, fn ($q, $v) => $q->whereDate('published_at', '>=', $v))
            ->when($f['to'] ?? null, fn ($q, $v) => $q->whereDate('published_at', '<=', $v))
            ->orderByDesc('published_at')
            ->get();

        $rows = $announcements->map(fn (Announcement $a) => [
            $a->title,
            $this->titleize($a->priority),
            $a->is_pinned ? 'Pinned' : '—',
            $a->branch?->name ?? 'Company-wide',
            $a->creator?->name ?? '—',
            $this->d($a->published_at),
        ])->all();

        return [
            'columns' => [
                ['label' => 'Title'], ['label' => 'Priority'], ['label' => 'Pinned'],
                ['label' => 'Audience'], ['label' => 'Author'], ['label' => 'Published'],
            ],
            'rows' => $rows,
            'summary' => [
                ['label' => 'Announcements', 'value' => (string) $announcements->count()],
                ['label' => 'High priority', 'value' => (string) $announcements->where('priority', 'high')->count()],
                ['label' => 'Pinned', 'value' => (string) $announcements->where('is_pinned', true)->count()],
            ],
        ];
    }

    private function buildBillingStatement(array $f, User $user): array
    {
        $invoices = Invoice::where('company_id', $user->company_id)
            ->when($f['invoice_status'] ?? null, fn ($q, $v) => $q->where('status', $v))
            ->when($f['from'] ?? null, fn ($q, $v) => $q->whereDate('issued_at', '>=', $v))
            ->when($f['to'] ?? null, fn ($q, $v) => $q->whereDate('issued_at', '<=', $v))
            ->orderByDesc('issued_at')
            ->get();

        $rows = $invoices->map(fn (Invoice $i) => [
            $i->number,
            $i->period_label ?: $i->description,
            $this->d($i->issued_at),
            $this->d($i->due_at),
            $this->money($i->amount),
            $this->titleize($i->status),
        ])->all();

        $outstanding = $invoices->whereIn('status', ['unpaid', 'overdue'])->sum('amount');

        return [
            'columns' => [
                ['label' => 'Invoice No.'], ['label' => 'Description'], ['label' => 'Issued'], ['label' => 'Due'],
                ['label' => 'Amount', 'align' => 'right'], ['label' => 'Status'],
            ],
            'rows' => $rows,
            'summary' => [
                ['label' => 'Invoices', 'value' => (string) $invoices->count()],
                ['label' => 'Total billed', 'value' => $this->money($invoices->where('status', '!=', 'void')->sum('amount'))],
                ['label' => 'Paid', 'value' => $this->money($invoices->where('status', 'paid')->sum('amount'))],
                ['label' => 'Outstanding', 'value' => $this->money($outstanding)],
            ],
        ];
    }

    // -- Helpers -------------------------------------------------------------

    /**
     * Branch-scope a model that doesn't use the BelongsToBranch global scope.
     * `$nullable` keeps company-wide rows (branch_id = null) in the result.
     */
    private function scopeToBranches(Builder $query, User $user, bool $nullable = false): Builder
    {
        if ($user->isSuperAdmin()) {
            return $query;
        }

        $ids = $user->accessibleBranchIds() ?: [0];

        return $nullable
            ? $query->where(fn ($q) => $q->whereNull('branch_id')->orWhereIn('branch_id', $ids))
            : $query->whereIn('branch_id', $ids);
    }

    /** "2026-07-08" => "Jul 8, 2026" */
    private function d($value): string
    {
        return $value ? Carbon::parse($value)->format('M j, Y') : '—';
    }

    /** "2026-07-08 14:30" => "Jul 8, 2026 2:30 PM" */
    private function dt($value): string
    {
        return $value ? Carbon::parse($value)->format('M j, Y g:i A') : '—';
    }

    /** "14:30:00" => "2:30 PM" */
    private function t(?string $value): string
    {
        return $value ? Carbon::parse($value)->format('g:i A') : '—';
    }

    private function minutes(int $mins): string
    {
        return $mins < 60 ? "{$mins}m" : intdiv($mins, 60) . 'h ' . $mins % 60 . 'm';
    }

    private function money($amount): string
    {
        return 'PHP ' . number_format((float) $amount, 2);
    }

    /** "full_time" => "Full Time" */
    private function titleize(?string $value): string
    {
        return $value ? ucwords(str_replace('_', ' ', $value)) : '—';
    }
}
