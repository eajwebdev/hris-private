import { cn } from '@/lib/utils';

export function Card({ className, ...props }) {
    return <div className={cn('card-surface', className)} {...props} />;
}

export function CardHeader({ className, ...props }) {
    return <div className={cn('flex items-start justify-between gap-4 p-5 pb-0', className)} {...props} />;
}

export function CardTitle({ className, ...props }) {
    return <h3 className={cn('text-base font-semibold text-foreground', className)} {...props} />;
}

export function CardDescription({ className, ...props }) {
    return <p className={cn('text-sm text-muted mt-0.5', className)} {...props} />;
}

export function CardBody({ className, ...props }) {
    return <div className={cn('p-5', className)} {...props} />;
}

export function CardFooter({ className, ...props }) {
    return <div className={cn('flex items-center gap-2 p-5 pt-0', className)} {...props} />;
}
