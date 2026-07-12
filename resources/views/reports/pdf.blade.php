{{--
    Generic report document. Every module's report renders through this one view:
    ReportService hands us pre-formatted `columns`, `rows` and `summary` tiles.

    Constrained to what dompdf actually supports — tables for layout (no flex or
    grid), no web fonts, and `position: fixed` for the repeating page footer.
--}}
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>{{ $report['title'] }}</title>
    <style>
        @page { margin: 34px 30px 56px; }

        body {
            font-family: DejaVu Sans, sans-serif;
            font-size: 8.5pt;
            color: #1c1c1e;
            margin: 0;
        }

        .rule { height: 3px; background: {{ $brand }}; margin-bottom: 12px; }

        /* -- Masthead -------------------------------------------------- */
        .masthead { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
        .masthead td { vertical-align: middle; padding: 0; }
        .masthead .logo { width: 46px; }
        .masthead .logo img { height: 34px; }
        .system-name { font-size: 8pt; letter-spacing: 1.4px; text-transform: uppercase; color: #6b6b70; }
        .title { font-size: 15pt; font-weight: bold; margin-top: 1px; }
        .description { font-size: 8pt; color: #6b6b70; margin-top: 2px; }
        .meta { text-align: right; font-size: 7.5pt; color: #6b6b70; line-height: 1.55; }
        .meta b { color: #1c1c1e; font-weight: normal; }

        /* -- Applied filters ------------------------------------------- */
        .filters { margin-bottom: 11px; font-size: 7.5pt; }
        .chip {
            display: inline-block;
            border: 0.6px solid #e2e2e5;
            border-radius: 9px;
            padding: 2.5px 7px;
            margin: 0 3px 3px 0;
            background: #fafafa;
        }
        .chip span { color: #6b6b70; }

        /* -- Summary tiles --------------------------------------------- */
        .summary { width: 100%; border-collapse: separate; border-spacing: 6px 0; margin-bottom: 12px; }
        .summary td {
            border: 0.6px solid #e2e2e5;
            border-radius: 7px;
            padding: 7px 9px;
            background: #fafafa;
        }
        .summary .label { font-size: 7pt; text-transform: uppercase; letter-spacing: 0.6px; color: #6b6b70; }
        .summary .value { font-size: 11.5pt; font-weight: bold; margin-top: 2px; }

        /* -- Data table ------------------------------------------------- */
        table.data { width: 100%; border-collapse: collapse; }
        table.data thead th {
            background: {{ $brand }};
            color: #fff;
            font-size: 7.5pt;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 0.4px;
            text-align: left;
            padding: 6px 7px;
        }
        table.data td {
            padding: 5.5px 7px;
            border-bottom: 0.6px solid #ececef;
            /* Long free-text cells (reasons, descriptions) must not blow the column out. */
            word-wrap: break-word;
        }
        table.data tr.alt td { background: #fafafa; }
        .right { text-align: right; }
        .center { text-align: center; }

        .empty { padding: 34px; text-align: center; color: #6b6b70; border: 0.6px dashed #d8d8dc; border-radius: 7px; }
        .truncated { margin-top: 9px; font-size: 7.5pt; color: #8a6d1f; background: #fdf7e3; border-radius: 6px; padding: 6px 9px; }

        {{-- The running footer is drawn on the canvas in ReportController::stampFooter():
             dompdf resolves CSS counter(pages) to 0 because the page total isn't known
             during reflow, so "Page 3 of 12" has to come from the canvas API. --}}
    </style>
</head>
<body>
    <div class="rule"></div>

    <table class="masthead">
        <tr>
            @if ($logo)
                <td class="logo"><img src="{{ $logo }}" alt=""></td>
            @endif
            <td>
                <div class="system-name">{{ $systemName }}</div>
                <div class="title">{{ $report['title'] }}</div>
                <div class="description">{{ $report['description'] }}</div>
            </td>
            <td class="meta">
                Generated <b>{{ $generatedAt }}</b><br>
                by <b>{{ $generatedBy }}</b><br>
                <b>{{ number_format($report['total']) }}</b> record{{ $report['total'] === 1 ? '' : 's' }}
            </td>
        </tr>
    </table>

    @if ($report['applied'])
        <div class="filters">
            @foreach ($report['applied'] as $chip)
                <span class="chip"><span>{{ $chip['label'] }}:</span> {{ $chip['value'] }}</span>
            @endforeach
        </div>
    @endif

    @if ($report['summary'])
        <table class="summary">
            <tr>
                @foreach ($report['summary'] as $tile)
                    <td width="{{ floor(100 / count($report['summary'])) }}%">
                        <div class="label">{{ $tile['label'] }}</div>
                        <div class="value">{{ $tile['value'] }}</div>
                    </td>
                @endforeach
            </tr>
        </table>
    @endif

    @if (empty($report['rows']))
        <div class="empty">No records matched these filters.</div>
    @else
        <table class="data">
            <thead>
                <tr>
                    @foreach ($report['columns'] as $column)
                        <th @class(['right' => ($column['align'] ?? null) === 'right', 'center' => ($column['align'] ?? null) === 'center'])>
                            {{ $column['label'] }}
                        </th>
                    @endforeach
                </tr>
            </thead>
            <tbody>
                @foreach ($report['rows'] as $i => $row)
                    <tr @class(['alt' => $i % 2 === 1])>
                        @foreach ($row as $c => $cell)
                            <td @class([
                                'right' => ($report['columns'][$c]['align'] ?? null) === 'right',
                                'center' => ($report['columns'][$c]['align'] ?? null) === 'center',
                            ])>{{ $cell }}</td>
                        @endforeach
                    </tr>
                @endforeach
            </tbody>
        </table>

        @if ($report['truncated'])
            <div class="truncated">
                Showing the first {{ number_format(count($report['rows'])) }} records —
                {{ number_format($report['truncated']) }} more matched. Narrow the filters to see them.
            </div>
        @endif
    @endif
</body>
</html>
