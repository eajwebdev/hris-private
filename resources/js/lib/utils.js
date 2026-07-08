import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
    return twMerge(clsx(inputs));
}

export function initials(name = '') {
    return name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((n) => n[0]?.toUpperCase())
        .join('');
}

export function formatDate(value, opts = { month: 'short', day: 'numeric', year: 'numeric' }) {
    if (!value) return '—';
    return new Date(value).toLocaleDateString(undefined, opts);
}

export function formatTime(value) {
    if (!value) return '—';
    const d = typeof value === 'string' && value.length <= 8 ? new Date(`1970-01-01T${value}`) : new Date(value);
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** 95 → "1h 35m", 40 → "40m", 0 → "0m". */
export function minutesLabel(mins) {
    const m = Math.max(0, Math.round(Number(mins) || 0));
    if (m < 60) return `${m}m`;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function peso(n) {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(n || 0));
}

/**
 * Normalize a Laravel paginated response into a flat meta shape.
 * Handles both resource-collection responses (meta nested under `.meta`)
 * and raw paginators (fields at top level).
 */
export function pageMeta(data, fallbackPerPage = 15) {
    const m = data?.meta ?? data ?? {};
    const total = m.total ?? data?.data?.length ?? 0;
    const perPage = Number(m.per_page ?? fallbackPerPage);
    return {
        page: m.current_page ?? 1,
        lastPage: m.last_page ?? 1,
        total,
        perPage,
    };
}
