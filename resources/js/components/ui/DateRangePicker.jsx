import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    format, parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
    eachDayOfInterval, addMonths, subMonths, isSameMonth, isSameDay,
    isWithinInterval, isBefore, isAfter, startOfDay,
} from 'date-fns';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const base =
    'w-full rounded-xl border border-border bg-surface px-3.5 h-10 text-sm text-foreground ' +
    'focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25 disabled:opacity-50 transition-colors';

const toDate = (s) => (s ? (typeof s === 'string' ? parseISO(s) : s) : null);
const fmt = (d) => format(d, 'yyyy-MM-dd');
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function label(from, to) {
    if (!from) return null;
    if (!to) return `${format(from, 'MMM d, yyyy')} – …`;
    const sameYear = from.getFullYear() === to.getFullYear();
    return `${format(from, 'MMM d')} – ${format(to, sameYear ? 'MMM d, yyyy' : 'MMM d, yyyy')}`;
}

/**
 * Modern single-control date range picker. Value + onChange use
 * { from, to } as 'YYYY-MM-DD' strings (empty string = unset).
 */
export function DateRangePicker({ value, onChange, placeholder = 'Select date range', minDate, maxDate, presets = true, disabled, className }) {
    const min = toDate(minDate);
    const max = toDate(maxDate);

    const [open, setOpen] = useState(false);
    const [month, setMonth] = useState(() => toDate(value?.from) || new Date());
    const [from, setFrom] = useState(toDate(value?.from));
    const [to, setTo] = useState(toDate(value?.to));
    const [hover, setHover] = useState(null);
    const [coords, setCoords] = useState(null);
    const btnRef = useRef(null);

    // Resync from props whenever the popover opens.
    useEffect(() => {
        if (open) {
            setFrom(toDate(value?.from));
            setTo(toDate(value?.to));
            setMonth(toDate(value?.from) || new Date());
        }
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    useLayoutEffect(() => {
        if (!open) return;
        const update = () => {
            const r = btnRef.current?.getBoundingClientRect();
            if (!r) return;
            const below = window.innerHeight - r.bottom;
            const flip = below < 380 && r.top > below;
            setCoords({
                left: Math.min(r.left, window.innerWidth - 340),
                top: flip ? undefined : r.bottom + 6,
                bottom: flip ? window.innerHeight - r.top + 6 : undefined,
            });
        };
        update();
        window.addEventListener('resize', update);
        const onScroll = () => setOpen(false);
        window.addEventListener('scroll', onScroll, true);
        return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', onScroll, true); };
    }, [open]);

    const days = useMemo(() => {
        const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
        const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 0 });
        return eachDayOfInterval({ start: gridStart, end: gridEnd });
    }, [month]);

    const disabledDay = (d) => (min && isBefore(d, startOfDay(min))) || (max && isAfter(d, startOfDay(max)));

    const rangeEnd = to || hover;
    const inRange = (d) => {
        if (!from || !rangeEnd) return false;
        const [a, b] = isBefore(rangeEnd, from) ? [rangeEnd, from] : [from, rangeEnd];
        return isWithinInterval(d, { start: startOfDay(a), end: startOfDay(b) });
    };

    function pick(d) {
        if (disabledDay(d)) return;
        if (!from || to) { setFrom(d); setTo(null); return; }
        if (isBefore(d, from)) { setFrom(d); return; }
        setTo(d);
        onChange?.({ from: fmt(from), to: fmt(d) });
        setOpen(false);
    }

    function applyPreset(f, t) {
        setFrom(f); setTo(t); setMonth(f);
        onChange?.({ from: fmt(f), to: fmt(t) });
        setOpen(false);
    }

    function clear(e) {
        e?.stopPropagation();
        setFrom(null); setTo(null);
        onChange?.({ from: '', to: '' });
        setOpen(false);
    }

    const today = startOfDay(new Date());
    const presetList = [
        ['Today', () => applyPreset(today, today)],
        ['Last 7 days', () => applyPreset(new Date(today.getTime() - 6 * 864e5), today)],
        ['Last 30 days', () => applyPreset(new Date(today.getTime() - 29 * 864e5), today)],
        ['This month', () => applyPreset(startOfMonth(today), endOfMonth(today))],
        ['Last month', () => applyPreset(startOfMonth(subMonths(today, 1)), endOfMonth(subMonths(today, 1)))],
    ];

    const curFrom = toDate(value?.from);
    const curTo = toDate(value?.to);
    const display = label(curFrom, curTo);

    return (
        <>
            <button
                type="button"
                ref={btnRef}
                disabled={disabled}
                onClick={() => setOpen((o) => !o)}
                className={cn(base, 'flex items-center justify-between gap-2 text-left', className)}
            >
                <span className="flex items-center gap-2 truncate">
                    <Calendar className="h-4 w-4 shrink-0 text-muted" />
                    <span className={cn('truncate', !display && 'text-muted')}>{display || placeholder}</span>
                </span>
                {display ? (
                    <X className="h-4 w-4 shrink-0 text-muted hover:text-danger" onClick={clear} role="button" aria-label="Clear" />
                ) : null}
            </button>

            {open && coords && createPortal(
                <>
                    <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
                    <div
                        className="fixed z-[61] w-[320px] rounded-2xl border border-border bg-surface p-3 shadow-xl shadow-ink/10"
                        style={{ left: coords.left, top: coords.top, bottom: coords.bottom }}
                    >
                        {presets && (
                            <div className="mb-2 flex flex-wrap gap-1.5 border-b border-border pb-2.5">
                                {presetList.map(([lbl, fn]) => (
                                    <button key={lbl} type="button" onClick={fn}
                                        className="rounded-lg bg-surface-2 px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-brand-soft hover:text-brand">
                                        {lbl}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Month header */}
                        <div className="mb-2 flex items-center justify-between">
                            <button type="button" onClick={() => setMonth((m) => subMonths(m, 1))} className="rounded-lg p-1.5 text-muted hover:bg-surface-2">
                                <ChevronLeft className="h-4 w-4" />
                            </button>
                            <p className="font-display text-sm font-semibold">{format(month, 'MMMM yyyy')}</p>
                            <button type="button" onClick={() => setMonth((m) => addMonths(m, 1))} className="rounded-lg p-1.5 text-muted hover:bg-surface-2">
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>

                        {/* Weekday row */}
                        <div className="grid grid-cols-7 text-center text-[11px] font-medium text-muted">
                            {WEEKDAYS.map((d, i) => <div key={i} className="py-1">{d}</div>)}
                        </div>

                        {/* Days */}
                        <div className="grid grid-cols-7 gap-y-0.5" onMouseLeave={() => setHover(null)}>
                            {days.map((d) => {
                                const out = !isSameMonth(d, month);
                                const dis = disabledDay(d);
                                const isFrom = from && isSameDay(d, from);
                                const isTo = to && isSameDay(d, to);
                                const isEnd = isFrom || isTo;
                                const ranged = inRange(d) && !isEnd;
                                return (
                                    <button
                                        key={d.toISOString()}
                                        type="button"
                                        disabled={dis}
                                        onMouseEnter={() => setHover(d)}
                                        onClick={() => pick(d)}
                                        className={cn(
                                            'relative h-9 text-sm transition-colors',
                                            ranged && 'bg-brand-soft',
                                            isFrom && (to || hover) && !isTo && 'rounded-l-lg',
                                            isTo && 'rounded-r-lg',
                                            (isFrom && isTo) && 'rounded-lg',
                                        )}
                                    >
                                        <span className={cn(
                                            'mx-auto flex h-8 w-8 items-center justify-center rounded-lg',
                                            out ? 'text-muted/40' : 'text-foreground',
                                            dis && 'cursor-not-allowed text-muted/30 line-through',
                                            !dis && !isEnd && !ranged && 'hover:bg-surface-2',
                                            isEnd && 'bg-brand text-brand-ink font-semibold',
                                            isSameDay(d, today) && !isEnd && 'ring-1 ring-brand/40',
                                        )}>
                                            {format(d, 'd')}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        <div className="mt-2 flex items-center justify-between border-t border-border pt-2.5">
                            <button type="button" onClick={clear} className="text-xs font-medium text-muted hover:text-danger">Clear</button>
                            <button type="button" onClick={() => setOpen(false)} className="text-xs font-medium text-brand hover:underline">Done</button>
                        </div>
                    </div>
                </>,
                document.body
            )}
        </>
    );
}
