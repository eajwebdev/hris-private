import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Compact page list with ellipses: 1 … 4 5 [6] 7 8 … 20 */
function pageWindow(page, last) {
    const wanted = new Set([1, last, page, page - 1, page + 1]);
    const sorted = [...wanted].filter((p) => p >= 1 && p <= last).sort((a, b) => a - b);

    const out = [];
    let prev = 0;
    for (const p of sorted) {
        if (p - prev > 1) out.push('…');
        out.push(p);
        prev = p;
    }
    return out;
}

/**
 * Table pagination footer. Shows the visible range + total, and page
 * controls when there is more than one page. Renders nothing for empty sets.
 */
export function Pagination({ page, lastPage, total, perPage, onPage, className }) {
    if (!total) return null;

    const from = (page - 1) * perPage + 1;
    const to = Math.min(total, page * perPage);
    const btn = 'flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none';

    return (
        <div className={cn('flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between', className)}>
            <p className="text-xs text-muted">
                Showing <span className="font-medium text-foreground">{from}–{to}</span> of{' '}
                <span className="font-medium text-foreground">{total}</span>
            </p>

            {lastPage > 1 && (
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        className={cn(btn, 'text-muted hover:bg-surface-2 hover:text-foreground')}
                        onClick={() => onPage(page - 1)}
                        disabled={page <= 1}
                        aria-label="Previous page"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </button>

                    {pageWindow(page, lastPage).map((p, i) =>
                        p === '…' ? (
                            <span key={`ellipsis-${i}`} className="px-1.5 text-muted select-none">…</span>
                        ) : (
                            <button
                                key={p}
                                type="button"
                                onClick={() => onPage(p)}
                                aria-current={p === page ? 'page' : undefined}
                                className={cn(
                                    btn,
                                    p === page
                                        ? 'bg-brand text-brand-ink'
                                        : 'text-muted hover:bg-surface-2 hover:text-foreground'
                                )}
                            >
                                {p}
                            </button>
                        )
                    )}

                    <button
                        type="button"
                        className={cn(btn, 'text-muted hover:bg-surface-2 hover:text-foreground')}
                        onClick={() => onPage(page + 1)}
                        disabled={page >= lastPage}
                        aria-label="Next page"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </button>
                </div>
            )}
        </div>
    );
}
