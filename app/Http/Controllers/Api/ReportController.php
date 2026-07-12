<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use App\Services\ReportService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

/**
 * One printable report per module. `meta` hands the SPA the list of reports the
 * caller may run plus each one's filter schema, so the filter bar is rendered
 * from the server's definition rather than duplicated in the client.
 *
 * `render` streams a real PDF — the SPA previews the exact bytes it downloads.
 */
class ReportController extends Controller
{
    /** Masthead logo height in the PDF, in px; we embed at 2× for print sharpness. */
    private const LOGO_HEIGHT = 34;

    public function __construct(private ReportService $reports) {}

    public function meta(Request $request): JsonResponse
    {
        return response()->json(['reports' => $this->reports->definitions($request->user())]);
    }

    /**
     * Render a report. `?format=csv` returns a spreadsheet instead of a PDF;
     * `?download=1` swaps inline disposition for attachment.
     */
    public function render(Request $request, string $report)
    {
        abort_unless($this->reports->exists($report), 404, 'Unknown report.');

        $user = $request->user();
        $definition = $this->reports->definition($report);

        // Each report is gated by the module it reads from, not just `reports.view`.
        abort_unless($user->canModule($definition['module'], 'view'), 403, 'You don’t have access to this report.');

        $format = $request->string('format')->lower()->value() ?: 'pdf';
        abort_unless(in_array($format, ['pdf', 'csv'], true), 422, 'Unsupported format.');

        // A CSV is only ever a download, so it always needs the export permission.
        if ($request->boolean('download') || $format === 'csv') {
            abort_unless($user->canModule('reports', 'export'), 403, 'You don’t have permission to export reports.');
        }

        $filters = $this->validateFilters($request, $report);
        $data = $this->reports->build($report, $filters, $user);

        if ($format === 'csv') {
            return response($this->reports->toCsv($data), 200, [
                'Content-Type' => 'text/csv; charset=UTF-8',
                'Content-Disposition' => 'attachment; filename="' . $this->reports->filename($report, 'csv') . '"',
            ]);
        }

        $branding = Setting::branding();
        $pdf = Pdf::loadView('reports.pdf', [
            'report' => $data,
            'systemName' => $branding['system_name'],
            'logo' => $this->logoDataUri(),
            'brand' => $branding['vars']['brand'] ?: '#d61b5d',
            'generatedBy' => $user->name,
            'generatedAt' => now()->format('M j, Y g:i A'),
        ])->setPaper('a4', $data['orientation']);

        // laravel-dompdf ships with subsetting off, which embeds all of DejaVu Sans
        // and its bold face — ~880KB of font in every report. Subsetting cuts a
        // typical report to ~45KB.
        $pdf->setOption('isFontSubsettingEnabled', true);

        $this->stampFooter($pdf, $branding['system_name'] . ' · ' . $data['title']);

        $filename = $this->reports->filename($report);

        return $request->boolean('download') ? $pdf->download($filename) : $pdf->stream($filename);
    }

    /**
     * Draw the running footer — caption on the left, "Page N of M" on the right.
     *
     * This can't be done in CSS: dompdf resolves `counter(pages)` while the page
     * total is still unknown, so it always prints 0. `page_line`/`page_text` run
     * once per page at output time, and `{PAGE_COUNT}` is substituted then.
     * Rendering first is what makes the page total available.
     */
    private function stampFooter(\Barryvdh\DomPDF\PDF $pdf, string $caption): void
    {
        $pdf->render();

        $dompdf = $pdf->getDomPDF();
        $canvas = $dompdf->getCanvas();
        $font = $dompdf->getFontMetrics()->getFont('DejaVu Sans');
        $size = 7;
        $grey = [0.54, 0.54, 0.56];

        $margin = 22.5;                       // 30px page margin at dompdf's 96 dpi
        $width = $canvas->get_width();
        $baseline = $canvas->get_height() - 25;

        $pageLabel = 'Page {PAGE_NUM} of {PAGE_COUNT}';
        // Placeholders are wider than the digits that replace them; measure a realistic sample.
        $labelWidth = $dompdf->getFontMetrics()->getTextWidth('Page 88 of 88', $font, $size);

        $canvas->page_line($margin, $baseline - 8, $width - $margin, $baseline - 8, [0.89, 0.89, 0.90], 0.5);
        $canvas->page_text($margin, $baseline, $caption, $font, $size, $grey);
        $canvas->page_text($width - $margin - $labelWidth, $baseline, $pageLabel, $font, $size, $grey);
    }

    /**
     * Build validation rules from the report's own filter schema: dates must
     * parse, selects must be one of their offered options, required stays required.
     * Empty strings ("All") are dropped so builders can use `?? null`.
     */
    private function validateFilters(Request $request, string $report): array
    {
        $schema = collect($this->reports->definitions($request->user()))->firstWhere('key', $report);
        abort_unless($schema, 403, 'You don’t have access to this report.');

        $rules = [];
        foreach ($schema['filters'] as $filter) {
            $rule = [$filter['required'] ?? false ? 'required' : 'nullable'];
            $rule[] = $filter['type'] === 'date'
                ? 'date'
                : 'in:' . collect($filter['options'])->pluck('value')->implode(',');
            $rules[$filter['name']] = $rule;
        }

        $validated = $request->validate($rules);

        return array_filter($validated, fn ($v) => $v !== null && $v !== '');
    }

    /**
     * dompdf can't fetch remote URLs without enabling network access, so the
     * branding logo is inlined as a data URI. Falls back to the bundled mark.
     *
     * The source is whatever the admin uploaded — the default mark alone is a
     * 1536×1024 PNG — and dompdf embeds it at full resolution no matter how
     * small it is drawn, so it gets downscaled first. Cached per file mtime.
     */
    private function logoDataUri(): ?string
    {
        $stored = Setting::get('logo_path');
        $path = $stored ? storage_path('app/public/' . $stored) : public_path('logo2.png');

        if (! is_file($path)) {
            return null;
        }

        return Cache::rememberForever(
            'reports.logo.' . md5($path . '|' . filemtime($path)),
            fn () => $this->encodeLogo($path)
        );
    }

    private function encodeLogo(string $path): ?string
    {
        $extension = strtolower(pathinfo($path, PATHINFO_EXTENSION));

        // Vector art has no resolution to shrink.
        if ($extension === 'svg') {
            return 'data:image/svg+xml;base64,' . base64_encode(file_get_contents($path));
        }

        $mime = match ($extension) {
            'png' => 'image/png',
            'jpg', 'jpeg' => 'image/jpeg',
            'gif' => 'image/gif',
            default => null,
        };

        if (! $mime) {
            return null;
        }

        $inline = fn () => 'data:' . $mime . ';base64,' . base64_encode(file_get_contents($path));

        $target = self::LOGO_HEIGHT * 2;
        $size = @getimagesize($path);

        if (! extension_loaded('gd') || ! $size || $size[1] <= $target) {
            return $inline();
        }

        $source = match ($mime) {
            'image/png' => @imagecreatefrompng($path),
            'image/jpeg' => @imagecreatefromjpeg($path),
            'image/gif' => @imagecreatefromgif($path),
        };

        if (! $source) {
            return $inline();
        }

        $width = max(1, (int) round($size[0] * ($target / $size[1])));
        $resized = imagecreatetruecolor($width, $target);

        // Keep transparency — logos are usually PNGs on a transparent ground.
        imagealphablending($resized, false);
        imagesavealpha($resized, true);
        imagecopyresampled($resized, $source, 0, 0, 0, 0, $width, $target, $size[0], $size[1]);

        ob_start();
        imagepng($resized, null, 9);
        $bytes = ob_get_clean();

        imagedestroy($source);
        imagedestroy($resized);

        return 'data:image/png;base64,' . base64_encode($bytes);
    }
}
