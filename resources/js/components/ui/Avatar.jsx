import { cn } from '@/lib/utils';
import { initials } from '@/lib/utils';

export function Avatar({ name, src, size = 'md', className }) {
    const sizes = { sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-14 w-14 text-base' };
    return (
        <div
            className={cn(
                'inline-flex items-center justify-center rounded-full bg-brand-soft text-brand font-semibold overflow-hidden shrink-0',
                sizes[size],
                className
            )}
        >
            {src ? <img src={src} alt={name} className="h-full w-full object-cover" /> : initials(name)}
        </div>
    );
}
