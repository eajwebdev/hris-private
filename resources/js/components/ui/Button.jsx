import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

const variants = {
    primary: 'bg-brand text-brand-ink hover:opacity-90 shadow-sm',
    soft: 'bg-brand-soft text-brand hover:bg-brand-soft/70',
    outline: 'border border-border bg-surface text-foreground hover:bg-surface-2',
    ghost: 'text-foreground hover:bg-surface-2',
    danger: 'bg-danger text-white hover:opacity-90',
    subtle: 'bg-surface-2 text-foreground hover:bg-border',
};

const sizes = {
    sm: 'h-8 px-3 text-sm rounded-lg gap-1.5',
    md: 'h-10 px-4 text-sm rounded-xl gap-2',
    lg: 'h-12 px-6 text-base rounded-xl gap-2',
    icon: 'h-9 w-9 rounded-lg',
};

export function Button({ variant = 'primary', size = 'md', className, loading, children, disabled, ...props }) {
    return (
        <button
            className={cn(
                'inline-flex items-center justify-center font-medium transition-colors',
                'disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2',
                variants[variant],
                sizes[size],
                className
            )}
            disabled={disabled || loading}
            {...props}
        >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {children}
        </button>
    );
}
