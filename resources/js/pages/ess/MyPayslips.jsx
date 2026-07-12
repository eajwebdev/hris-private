import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Wallet, ChevronRight, Download } from 'lucide-react';
import api, { apiError, openBlob } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { LoadingBlock, EmptyState } from '@/components/ui/States';
import { formatDate, peso, minutesLabel } from '@/lib/utils';

function Line({ label, value, strong, danger }) {
    return (
        <div className="flex items-center justify-between py-1.5 text-sm">
            <span className={strong ? 'font-medium' : 'text-muted'}>{label}</span>
            <span className={`tabular ${strong ? 'font-display text-base font-semibold' : ''} ${danger ? 'text-danger' : ''}`}>{value}</span>
        </div>
    );
}

export default function MyPayslips() {
    const [viewing, setViewing] = useState(null);
    const { data, isLoading } = useQuery({ queryKey: ['payroll', 'my'], queryFn: async () => (await api.get('/payroll/my')).data });
    const slips = data?.data ?? [];

    return (
        <>
            <PageHeader title="Payslips" subtitle="Released payroll — tap one for the full breakdown." />

            {isLoading ? <LoadingBlock /> : slips.length === 0 ? (
                <EmptyState icon={Wallet} title="No payslips yet" message="Your payslips appear here once HR finalizes a payroll run." />
            ) : (
                <div className="space-y-2 max-w-2xl">
                    {slips.map((s, i) => (
                        <motion.button
                            key={s.id}
                            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                            onClick={() => setViewing(s)}
                            className="card-surface card-hover flex w-full items-center gap-3 p-4 text-left"
                        >
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
                                <Wallet className="h-5 w-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="font-medium">{formatDate(s.period?.start)} – {formatDate(s.period?.end)}</p>
                                <p className="text-xs text-muted">{s.days_present} day(s) worked{s.paid_leave_days > 0 && ` · ${s.paid_leave_days} paid leave`}</p>
                            </div>
                            <div className="text-right">
                                <p className="font-display font-semibold tabular">{peso(s.net_pay)}</p>
                                <p className="text-[11px] text-muted">net pay</p>
                            </div>
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
                        </motion.button>
                    ))}
                </div>
            )}

            <Modal
                open={!!viewing}
                onClose={() => setViewing(null)}
                title="Payslip"
                description={viewing && `${formatDate(viewing.period?.start)} – ${formatDate(viewing.period?.end)}`}
                footer={viewing && (
                    <div className="flex w-full justify-end gap-2">
                        <Button variant="outline" onClick={() => setViewing(null)}>Close</Button>
                        <Button
                            onClick={() => openBlob(`/payroll/payslips/${viewing.id}/pdf`, {
                                download: true,
                                filename: `payslip-${viewing.period?.end ?? ''}.pdf`,
                            }).catch((err) => toast.error(apiError(err, 'We couldn’t download that payslip.')))}
                        >
                            <Download className="h-4 w-4" /> Download PDF
                        </Button>
                    </div>
                )}
            >
                {viewing && (
                    <div className="space-y-1 divide-y divide-border [&>div]:pt-1.5">
                        <Line label="Monthly basic" value={peso(viewing.basic_salary)} />
                        <Line label="Daily rate" value={peso(viewing.daily_rate)} />
                        <Line label="Days present" value={viewing.days_present} />
                        {viewing.paid_leave_days > 0 && <Line label="Paid leave days" value={viewing.paid_leave_days} />}
                        {viewing.service_credit_days > 0 && <Line label="Service credit days" value={viewing.service_credit_days} />}

                        <Line label="Basic pay" value={peso(viewing.gross_pay)} />

                        {/* Allowances and other earnings HR has defined. */}
                        {(viewing.lines ?? []).filter((l) => l.type === 'earning').map((l) => (
                            <Line key={l.code} label={l.name} value={`+${peso(l.amount)}`} />
                        ))}
                        <Line label="Gross pay" value={peso(viewing.gross_pay + viewing.total_earnings)} strong />

                        {viewing.late_minutes > 0 && <Line label="Late" value={minutesLabel(viewing.late_minutes)} danger />}
                        {viewing.undertime_minutes > 0 && <Line label="Undertime" value={minutesLabel(viewing.undertime_minutes)} danger />}
                        {viewing.early_out_minutes > 0 && <Line label="Early out" value={minutesLabel(viewing.early_out_minutes)} danger />}
                        {viewing.late_deduction > 0 && <Line label="Late/undertime deduction" value={`−${peso(viewing.late_deduction)}`} danger />}

                        {/* Contributions, loans and any other deductions. */}
                        {(viewing.lines ?? []).filter((l) => l.type === 'deduction').map((l) => (
                            <Line key={l.code} label={l.name} value={`−${peso(l.amount)}`} danger />
                        ))}
                        {viewing.total_deductions > 0 && (
                            <Line label="Total deductions" value={`−${peso(viewing.total_deductions)}`} danger />
                        )}

                        <Line label="Net pay" value={peso(viewing.net_pay)} strong />
                    </div>
                )}
            </Modal>
        </>
    );
}
