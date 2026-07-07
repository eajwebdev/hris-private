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

export function peso(n) {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(n || 0));
}
