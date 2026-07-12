{{--
    Single payslip. Same dompdf constraints as reports/pdf.blade.php: tables for
    layout (no flex/grid), no web fonts.

    Earnings and deductions are read off the payslip's snapshotted lines, so this
    document always shows what was actually paid — even if the component set has
    been edited since the run.
--}}
@php
    $peso = fn ($n) => 'PHP ' . number_format((float) $n, 2);
    $employee = $slip->employee;
    $period = $slip->period;
    $earnings = $slip->lines->where('type', 'earning');
    $deductions = $slip->lines->where('type', 'deduction');
    $rows = max($earnings->count(), $deductions->count() + 1); // +1 for the built-in late deduction
@endphp
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Payslip · {{ $employee?->full_name }}</title>
    <style>
        @page { margin: 34px 30px; }

        body { font-family: DejaVu Sans, sans-serif; font-size: 9pt; color: #1c1c1e; margin: 0; }

        .rule { height: 3px; background: {{ $brand }}; margin-bottom: 14px; }

        .masthead { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
        .masthead td { vertical-align: top; padding: 0; }
        .system-name { font-size: 8pt; letter-spacing: 1.4px; text-transform: uppercase; color: #6b6b70; }
        .title { font-size: 16pt; font-weight: bold; margin-top: 2px; }
        .meta { text-align: right; font-size: 8pt; color: #6b6b70; line-height: 1.6; }
        .meta b { color: #1c1c1e; font-weight: normal; }

        /* -- Employee block --------------------------------------------- */
        .who { width: 100%; border-collapse: collapse; margin-bottom: 14px;
               border: 0.6px solid #e2e2e5; border-radius: 7px; background: #fafafa; }
        .who td { padding: 8px 10px; width: 25%; }
        .who .label { font-size: 7pt; text-transform: uppercase; letter-spacing: 0.6px; color: #6b6b70; }
        .who .value { font-size: 9.5pt; margin-top: 2px; }

        /* -- Earnings / deductions -------------------------------------- */
        table.money { width: 100%; border-collapse: collapse; }
        table.money th {
            font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.6px;
            text-align: left; padding: 6px 8px; background: #f2f2f4;
            border-bottom: 0.6px solid #e2e2e5;
        }
        table.money th.amt, table.money td.amt { text-align: right; }
        table.money td { padding: 5.5px 8px; border-bottom: 0.5px solid #f0f0f2; }
        table.money td.name { color: #3c3c40; }
        table.money tr.total td {
            font-weight: bold; border-top: 1px solid #d8d8dc; border-bottom: none;
            background: #fafafa; padding-top: 7px;
        }
        .col { width: 50%; vertical-align: top; padding: 0; }
        .gap { width: 12px; padding: 0; }

        /* -- Net pay ----------------------------------------------------- */
        .net { width: 100%; border-collapse: collapse; margin-top: 16px; }
        .net td {
            padding: 12px 14px; background: {{ $brand }}; color: #ffffff;
        }
        .net .label { font-size: 8pt; text-transform: uppercase; letter-spacing: 1px; }
        .net .value { font-size: 17pt; font-weight: bold; text-align: right; }

        .attendance { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 8pt; }
        .attendance td { padding: 6px 8px; border: 0.6px solid #e2e2e5; color: #6b6b70; }
        .attendance b { color: #1c1c1e; font-weight: normal; }

        .foot { margin-top: 20px; font-size: 7.5pt; color: #8a8a8f; text-align: center; line-height: 1.6; }
    </style>
</head>
<body>
    <div class="rule"></div>

    <table class="masthead">
        <tr>
            <td>
                <div class="system-name">{{ $systemName }}</div>
                <div class="title">Payslip</div>
            </td>
            <td class="meta">
                @if ($period)
                    Period: <b>{{ $period->period_start->format('M j') }} – {{ $period->period_end->format('M j, Y') }}</b><br>
                @endif
                Generated: <b>{{ $generatedAt }}</b>
            </td>
        </tr>
    </table>

    <table class="who">
        <tr>
            <td>
                <div class="label">Employee</div>
                <div class="value">{{ $employee?->full_name ?? '—' }}</div>
            </td>
            <td>
                <div class="label">Employee No.</div>
                <div class="value">{{ $employee?->employee_no ?? '—' }}</div>
            </td>
            <td>
                <div class="label">Position</div>
                <div class="value">{{ $employee?->position?->title ?? '—' }}</div>
            </td>
            <td>
                <div class="label">Branch</div>
                <div class="value">{{ $employee?->branch?->name ?? '—' }}</div>
            </td>
        </tr>
    </table>

    <table style="width: 100%; border-collapse: collapse;">
        <tr>
            {{-- Earnings --}}
            <td class="col">
                <table class="money">
                    <tr><th>Earnings</th><th class="amt">Amount</th></tr>

                    <tr>
                        <td class="name">
                            Basic pay
                            <div style="font-size: 7pt; color: #8a8a8f;">
                                {{ rtrim(rtrim(number_format((float) $slip->days_present, 1), '0'), '.') }} day(s)
                                @if ((float) $slip->paid_leave_days > 0)
                                    + {{ rtrim(rtrim(number_format((float) $slip->paid_leave_days, 1), '0'), '.') }} paid leave
                                @endif
                                @if ((float) $slip->service_credit_days > 0)
                                    + {{ rtrim(rtrim(number_format((float) $slip->service_credit_days, 1), '0'), '.') }} credit
                                @endif
                                @ {{ $peso($slip->daily_rate) }}/day
                            </div>
                        </td>
                        <td class="amt">{{ $peso($slip->gross_pay) }}</td>
                    </tr>

                    @foreach ($earnings as $line)
                        <tr>
                            <td class="name">{{ $line->name }}</td>
                            <td class="amt">{{ $peso($line->amount) }}</td>
                        </tr>
                    @endforeach

                    <tr class="total">
                        <td>Gross pay</td>
                        <td class="amt">{{ $peso((float) $slip->gross_pay + (float) $slip->total_earnings) }}</td>
                    </tr>
                </table>
            </td>

            <td class="gap"></td>

            {{-- Deductions --}}
            <td class="col">
                <table class="money">
                    <tr><th>Deductions</th><th class="amt">Amount</th></tr>

                    @if ((float) $slip->late_deduction > 0)
                        <tr>
                            <td class="name">
                                Tardiness &amp; undertime
                                <div style="font-size: 7pt; color: #8a8a8f;">
                                    {{ $slip->late_minutes + $slip->undertime_minutes + $slip->early_out_minutes }} minute(s)
                                </div>
                            </td>
                            <td class="amt">{{ $peso($slip->late_deduction) }}</td>
                        </tr>
                    @endif

                    @forelse ($deductions as $line)
                        <tr>
                            <td class="name">{{ $line->name }}</td>
                            <td class="amt">{{ $peso($line->amount) }}</td>
                        </tr>
                    @empty
                        @if ((float) $slip->late_deduction <= 0)
                            <tr><td class="name" colspan="2" style="color: #8a8a8f;">No deductions this period.</td></tr>
                        @endif
                    @endforelse

                    <tr class="total">
                        <td>Total deductions</td>
                        <td class="amt">{{ $peso($slip->total_deductions) }}</td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>

    <table class="net">
        <tr>
            <td class="label">Net pay</td>
            <td class="value">{{ $peso($slip->net_pay) }}</td>
        </tr>
    </table>

    <table class="attendance">
        <tr>
            <td>Days present: <b>{{ rtrim(rtrim(number_format((float) $slip->days_present, 1), '0'), '.') }}</b></td>
            <td>Paid leave: <b>{{ rtrim(rtrim(number_format((float) $slip->paid_leave_days, 1), '0'), '.') }}</b></td>
            <td>Late: <b>{{ $slip->late_minutes }}m</b></td>
            <td>Undertime: <b>{{ $slip->undertime_minutes }}m</b></td>
            <td>Early out: <b>{{ $slip->early_out_minutes }}m</b></td>
        </tr>
    </table>

    <div class="foot">
        This is a system-generated payslip and is valid without a signature.<br>
        Monthly basic: {{ $peso($slip->basic_salary) }} · Daily rate: {{ $peso($slip->daily_rate) }}
    </div>
</body>
</html>
