import { forwardRef, useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Input with a leading icon and a label that rests inside the field, then lifts to sit
 * on the top border once the field is focused or filled.
 *
 * The lift is driven entirely by CSS (`peer-focus` + `peer-[:not(:placeholder-shown)]`)
 * rather than React state — the browser already knows whether the field is focused and
 * whether it has a value, so mirroring that into state would just be a second source of
 * truth that can drift (notably on browser autofill, which fires no change event).
 *
 * The `placeholder=" "` is load-bearing: `:placeholder-shown` only matches while a
 * placeholder exists, and that pseudo-class is what tells us the field is empty.
 */
export const FloatingInput = forwardRef(function FloatingInput(
    { label, icon: Icon, type = 'text', className, id, ...props },
    ref,
) {
    const autoId = useId();
    const inputId = id ?? autoId;

    // A password field grows a reveal toggle, which needs room on the right.
    const isPassword = type === 'password';
    const [revealed, setRevealed] = useState(false);
    const resolvedType = isPassword && revealed ? 'text' : type;

    return (
        <div className="relative">
            {/* The input comes FIRST in the DOM so the icon and label can be its Tailwind
                `peer` — peer-* only styles later siblings. Both are absolutely positioned,
                so DOM order has no bearing on what you see. */}
            <input
                {...props}
                ref={ref}
                id={inputId}
                type={resolvedType}
                placeholder=" "
                className={cn(
                    // No top padding: the label floats onto the top BORDER, not into the
                    // field, so reserving space for it would just push the typed text out
                    // of line with the leading icon.
                    'peer h-14 w-full rounded-xl border border-border bg-surface px-3.5 text-sm text-foreground',
                    'transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20',
                    'disabled:opacity-50',
                    Icon && 'pl-11',
                    isPassword && 'pr-11',
                    className,
                )}
            />

            {Icon && (
                <Icon
                    size={17}
                    aria-hidden
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted transition-colors peer-focus:text-brand"
                />
            )}

            <label
                htmlFor={inputId}
                className={cn(
                    'pointer-events-none absolute top-1/2 -translate-y-1/2 text-sm text-muted',
                    'transition-all duration-150 ease-out',
                    Icon ? 'left-11' : 'left-3.5',
                    // Resting state is vertically centred; both the focused and the
                    // filled state lift it onto the border as a small chip.
                    'peer-focus:top-0 peer-focus:left-3 peer-focus:text-xs peer-focus:font-medium peer-focus:text-brand',
                    'peer-focus:bg-surface peer-focus:px-1.5',
                    'peer-[:not(:placeholder-shown)]:top-0 peer-[:not(:placeholder-shown)]:left-3',
                    'peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:font-medium',
                    'peer-[:not(:placeholder-shown)]:bg-surface peer-[:not(:placeholder-shown)]:px-1.5',
                )}
            >
                {label}
            </label>

            {isPassword && (
                <button
                    type="button"
                    onClick={() => setRevealed((v) => !v)}
                    aria-label={revealed ? 'Hide password' : 'Show password'}
                    className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted transition-colors hover:text-foreground"
                >
                    {revealed ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
            )}
        </div>
    );
});
