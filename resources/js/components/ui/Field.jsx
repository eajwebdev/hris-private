import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

// All <Select> across the app are searchable comboboxes (API-compatible drop-in).
export { SearchSelect as Select } from './SearchSelect';

export function Label({ className, ...props }) {
    return <label className={cn('block text-sm font-medium text-foreground mb-1.5', className)} {...props} />;
}

const base =
    'w-full rounded-xl border border-border bg-surface px-3.5 h-10 text-sm text-foreground placeholder:text-muted ' +
    'focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25 disabled:opacity-50 transition-colors';

export const Input = forwardRef(function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(base, className)} {...props} />;
});

export const Textarea = forwardRef(function Textarea({ className, rows = 4, ...props }, ref) {
    return <textarea ref={ref} rows={rows} className={cn(base, 'h-auto py-2.5', className)} {...props} />;
});


export function Field({ label, hint, error, children, className }) {
    return (
        <div className={className}>
            {label && <Label>{label}</Label>}
            {children}
            {error ? (
                <p className="text-xs text-danger mt-1.5">{error}</p>
            ) : hint ? (
                <p className="text-xs text-muted mt-1.5">{hint}</p>
            ) : null}
        </div>
    );
}
