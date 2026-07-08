import { Children, forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

const base =
    'w-full rounded-xl border border-border bg-surface px-3.5 h-10 text-sm text-foreground ' +
    'focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25 disabled:opacity-50 transition-colors';

/** Flatten a React option's children into plain text for display + search. */
function nodeText(node) {
    if (node == null || node === false) return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(nodeText).join('');
    if (node?.props?.children != null) return nodeText(node.props.children);
    return '';
}

/**
 * Drop-in searchable replacement for a native <select>. API-compatible with the
 * old <Select>: accepts <option> children (or an `options` prop) and emits
 * onChange({ target: { value } }). Renders a portal popover with a filter box.
 */
export const SearchSelect = forwardRef(function SearchSelect(
    { className, children, value, onChange, options, placeholder = 'Select…', searchPlaceholder = 'Search…', disabled, name, ...props },
    ref
) {
    const opts = useMemo(() => {
        if (options) return options.map((o) => ({ value: o.value, label: o.label ?? String(o.value), className: o.className }));
        return Children.toArray(children)
            .filter((c) => c && c.type === 'option')
            // Coerce to string to mirror native <option> value semantics exactly.
            .map((c) => ({ value: c.props.value == null ? '' : String(c.props.value), label: nodeText(c.props.children), className: c.props.className }));
    }, [children, options]);

    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(0);
    const [coords, setCoords] = useState(null);
    const btnRef = useRef(null);
    const listRef = useRef(null);

    const selected = opts.find((o) => String(o.value) === String(value ?? ''));
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return q ? opts.filter((o) => o.label.toLowerCase().includes(q)) : opts;
    }, [opts, query]);

    // Position the portal popover, flipping up when there's not enough room below.
    useLayoutEffect(() => {
        if (!open) return;
        const update = () => {
            const r = btnRef.current?.getBoundingClientRect();
            if (!r) return;
            const below = window.innerHeight - r.bottom;
            const above = r.top;
            const flip = below < 240 && above > below;
            setCoords({
                left: r.left,
                width: r.width,
                top: flip ? undefined : r.bottom + 6,
                bottom: flip ? window.innerHeight - r.top + 6 : undefined,
                maxHeight: Math.min(300, (flip ? above : below) - 16),
            });
        };
        update();
        window.addEventListener('resize', update);
        // Close on any scroll so the popover never drifts from its trigger.
        const onScroll = () => setOpen(false);
        window.addEventListener('scroll', onScroll, true);
        return () => {
            window.removeEventListener('resize', update);
            window.removeEventListener('scroll', onScroll, true);
        };
    }, [open]);

    useEffect(() => {
        if (!open) { setQuery(''); return; }
        setActive(Math.max(0, filtered.findIndex((o) => String(o.value) === String(value ?? ''))));
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    // Keep the highlighted row scrolled into view.
    useEffect(() => {
        if (!open || !listRef.current) return;
        const el = listRef.current.children[active];
        el?.scrollIntoView({ block: 'nearest' });
    }, [active, open]);

    function choose(opt) {
        onChange?.({ target: { value: opt.value, name } });
        setOpen(false);
    }

    function onKeyDown(e) {
        if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpen(true); return; }
        if (!open) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(filtered.length - 1, a + 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
        else if (e.key === 'Enter') { e.preventDefault(); if (filtered[active]) choose(filtered[active]); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); }
    }

    return (
        <>
            <button
                type="button"
                ref={(el) => { btnRef.current = el; if (typeof ref === 'function') ref(el); else if (ref) ref.current = el; }}
                disabled={disabled}
                onClick={() => setOpen((o) => !o)}
                onKeyDown={onKeyDown}
                className={cn(base, 'flex items-center justify-between gap-2 text-left', className)}
                aria-haspopup="listbox"
                aria-expanded={open}
                {...props}
            >
                <span className={cn('truncate', !selected && 'text-muted')}>{selected ? selected.label : placeholder}</span>
                <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted transition-transform', open && 'rotate-180')} />
            </button>

            {open && coords && createPortal(
                <>
                    <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
                    <div
                        className="fixed z-[61] overflow-hidden rounded-xl border border-border bg-surface shadow-xl shadow-ink/10"
                        style={{ left: coords.left, top: coords.top, bottom: coords.bottom, width: Math.max(coords.width, 200) }}
                    >
                        <div className="flex items-center gap-2 border-b border-border px-3">
                            <Search className="h-4 w-4 shrink-0 text-muted" />
                            <input
                                autoFocus
                                value={query}
                                onChange={(e) => { setQuery(e.target.value); setActive(0); }}
                                onKeyDown={onKeyDown}
                                placeholder={searchPlaceholder}
                                className="h-10 w-full bg-transparent text-sm text-foreground placeholder:text-muted focus:outline-none"
                            />
                        </div>
                        <div ref={listRef} className="overflow-y-auto py-1" style={{ maxHeight: coords.maxHeight }} role="listbox">
                            {filtered.length === 0 ? (
                                <p className="px-3 py-6 text-center text-sm text-muted">No results</p>
                            ) : filtered.map((opt, i) => {
                                const isSel = String(opt.value) === String(value ?? '');
                                return (
                                    <button
                                        type="button"
                                        key={`${opt.value}-${i}`}
                                        role="option"
                                        aria-selected={isSel}
                                        onMouseEnter={() => setActive(i)}
                                        onClick={() => choose(opt)}
                                        className={cn(
                                            'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors',
                                            i === active ? 'bg-surface-2' : '',
                                            isSel ? 'font-medium text-brand' : 'text-foreground',
                                            opt.className
                                        )}
                                    >
                                        <span className="truncate">{opt.label || <span className="text-muted">—</span>}</span>
                                        {isSel && <Check className="h-4 w-4 shrink-0 text-brand" />}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </>,
                document.body
            )}
        </>
    );
});
