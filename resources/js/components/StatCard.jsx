import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/utils';

export function StatCard({ label, value, icon: Icon, trend, tone = 'brand', index = 0 }) {
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
            transition={{ delay: index * 0.05 }}
        >
            <Card className="p-5">
                <div className="flex items-start justify-between">
                    <div>
                        <p className="text-sm text-muted">{label}</p>
                        <p className="mt-1 text-3xl font-display font-semibold tabular">{value}</p>
                    </div>
                    {Icon && (
                        <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl', tones[tone])}>
                            <Icon className="h-5 w-5" />
                        </div>
                    )}
                </div>
                {trend != null && (
                    <div className={cn('mt-3 flex items-center gap-1 text-xs font-medium', trend >= 0 ? 'text-success' : 'text-danger')}>
                        {trend >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                        {Math.abs(trend)}% vs last period
                    </div>
                )}
            </Card>
        </motion.div>
    );
}
