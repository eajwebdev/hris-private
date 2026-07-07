import { cn } from '@/lib/utils';

const tones = {
    neutral: 'bg-surface-2 text-muted',
    brand: 'bg-brand-soft text-brand',
    amber: 'bg-amber/15 text-amber',
    danger: 'bg-danger/12 text-danger',
    success: 'bg-success/15 text-success',
};

export function Badge({ tone = 'neutral', className, children }) {
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
                tones[tone] ?? tones.neutral,
                className
            )}
        >
            {children}
        </span>
    );
}

// Maps common status strings to a tone.
export function statusTone(status = '') {
    const s = status.toLowerCase();
    if (['approved', 'paid', 'active', 'regular', 'hired', 'present', 'open'].some((k) => s.includes(k))) return 'success';
    if (['pending', 'submitted', 'screening', 'interview', 'probationary', 'draft', 'unpaid'].some((k) => s.includes(k))) return 'amber';
    if (['rejected', 'terminated', 'resigned', 'overdue', 'closed', 'absent', 'late'].some((k) => s.includes(k))) return 'danger';
    return 'neutral';
}
