import { cn } from '@/lib/utils';

export function Table({ className, children }) {
    return (
        <div className="overflow-x-auto">
            <table className={cn('w-full text-sm', className)}>{children}</table>
        </div>
    );
}

export function THead({ children }) {
    return (
        <thead className="text-left text-xs uppercase tracking-wide text-muted">
            <tr className="border-b border-border">{children}</tr>
        </thead>
    );
}

export function TH({ className, children }) {
    return <th className={cn('px-4 py-3 font-medium', className)}>{children}</th>;
}

export function TBody({ children }) {
    return <tbody className="divide-y divide-border">{children}</tbody>;
}

export function TR({ className, children, ...props }) {
    return (
        <tr className={cn('hover:bg-surface-2/60 transition-colors', className)} {...props}>
            {children}
        </tr>
    );
}

export function TD({ className, children, ...props }) {
    return (
        <td className={cn('px-4 py-3 align-middle', className)} {...props}>
            {children}
        </td>
    );
}
