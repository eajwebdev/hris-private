import { cn } from '@/lib/utils';

/** Lightweight CSS tooltip — wraps a trigger, shows `label` on hover/focus. */
export function Tooltip({ label, children, side = 'top' }) {
    const pos = {
        top: 'bottom-full left-1/2 -translate-x-1/2 mb-2 group-hover/tt:-translate-y-0.5',
        bottom: 'top-full left-1/2 -translate-x-1/2 mt-2 group-hover/tt:translate-y-0.5',
        left: 'right-full top-1/2 -translate-y-1/2 mr-2 group-hover/tt:-translate-x-0.5',
    };
    return (
        <span className="relative inline-flex group/tt">
            {children}
            <span
                role="tooltip"
                className={cn(
                    'pointer-events-none absolute z-50 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs font-medium text-white shadow-lg shadow-ink/20',
                    'opacity-0 scale-90 group-hover/tt:opacity-100 group-hover/tt:scale-100 group-focus-within/tt:opacity-100 group-focus-within/tt:scale-100',
                    'transition-all duration-150 ease-out',
                    pos[side]
                )}
            >
                {label}
            </span>
        </span>
    );
}
