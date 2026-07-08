import { Tooltip } from './Tooltip';
import { Button } from './Button';
import { cn } from '@/lib/utils';

const toneClasses = {
    ghost: 'text-muted hover:text-foreground',
    brand: 'text-muted hover:text-brand hover:bg-brand-soft',
    danger: 'text-muted hover:text-danger hover:bg-danger/10',
};

/** Icon-only row action with a hover tooltip (Edit / Delete / View / Approve …). */
export function IconButton({ label, icon: Icon, onClick, tone = 'ghost', disabled, side = 'top' }) {
    return (
        <Tooltip label={label} side={side}>
            <Button
                variant="ghost"
                size="icon"
                onClick={onClick}
                disabled={disabled}
                aria-label={label}
                className={cn(
                    'transition-all hover:scale-110 active:scale-95',
                    toneClasses[tone] ?? toneClasses.ghost
                )}
            >
                <Icon className="h-4 w-4" />
            </Button>
        </Tooltip>
    );
}
