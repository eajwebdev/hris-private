import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Spinner({ className }) {
    return <Loader2 className={cn('h-5 w-5 animate-spin text-muted', className)} />;
}

export function LoadingBlock({ label = 'Loading…' }) {
    return (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted">
            <Spinner className="h-6 w-6" />
            <p className="text-sm">{label}</p>
        </div>
    );
}

/** Empty state that tells the user what to do next. */
export function EmptyState({ icon: Icon, title, message, action }) {
    return (
        <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
            {Icon && (
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft text-brand">
                    <Icon className="h-7 w-7" />
                </div>
            )}
            <h3 className="text-base font-semibold font-display">{title}</h3>
            {message && <p className="text-sm text-muted max-w-sm">{message}</p>}
            {action && <div className="mt-2">{action}</div>}
        </div>
    );
}

export function ErrorState({ message = 'We couldn’t load this. Check your connection and try again.', onRetry }) {
    return (
        <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
            <h3 className="text-base font-semibold text-danger">Couldn’t load this</h3>
            <p className="text-sm text-muted max-w-sm">{message}</p>
            {onRetry && (
                <button onClick={onRetry} className="text-sm font-medium text-brand hover:underline">
                    Try again
                </button>
            )}
        </div>
    );
}
