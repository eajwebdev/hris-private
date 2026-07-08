import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/utils';

/**
 * KPI tile — fixed geometry so a whole row reads as one system:
 * label (one line) + icon on top, value below, optional detail/trend line.
 */
export function StatCard({ label, value, icon: Icon, trend, detail, tone = 'brand', index = 0 }) {
    const tones = {
        brand: 'bg-brand-soft text-brand',
        amber: 'bg-amber/15 text-amber',
        danger: 'bg-danger/12 text-danger',
        success: 'bg-success/15 text-success',
    };
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.04 }}
            className="h-full"
        >
            <Card className="card-hover flex h-full flex-col p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-[13px] font-medium text-muted">{label}</p>
                    {Icon && (
                        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', tones[tone])}>
                            <Icon className="h-[18px] w-[18px]" />
                        </div>
                    )}
                </div>
                <p className="mt-1 font-display text-2xl font-semibold tabular sm:text-3xl">{value}</p>
                <div className="mt-auto pt-1 min-h-[18px]">
                    {trend != null ? (
                        <span className={cn('flex items-center gap-1 text-xs font-medium', trend >= 0 ? 'text-success' : 'text-danger')}>
                            {trend >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                            {Math.abs(trend)}% vs last period
                        </span>
                    ) : detail ? (
                        <span className="text-xs text-muted">{detail}</span>
                    ) : null}
                </div>
            </Card>
        </motion.div>
    );
}
