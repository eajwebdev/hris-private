import { Tooltip } from './Tooltip';
import { Button } from './Button';

/** Icon-only row action with a hover tooltip (Edit / Delete / View / Approve …). */
export function IconButton({ label, icon: Icon, onClick, tone = 'ghost', disabled }) {
    return (
        <Tooltip label={label}>
            <Button
                variant={tone}
                size="icon"
                onClick={onClick}
                disabled={disabled}
                aria-label={label}
                className={tone === 'ghost' ? 'text-muted hover:text-foreground' : ''}
            >
                <Icon className="h-4 w-4" />
            </Button>
        </Tooltip>
    );
}
