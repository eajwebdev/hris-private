import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Plus, CalendarClock, XCircle, Paperclip, Check, X, Clock, Minus, AlertTriangle } from 'lucide-react';
import api, { apiError } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { DateRangePicker } from '@/components/ui/DateRangePicker';
import { LoadingBlock, EmptyState } from '@/components/ui/States';
import { formatDate, cn } from '@/lib/utils';

const STATUS_TONE = { pending: 'amber', approved: 'success', rejected: 'danger', cancelled: 'neutral' };

const STEP_ICON = { approved: Check, rejected: X, pending: Clock, skipped: Minus };

/** Submitted → each approval step → settled. */
function ApprovalTimeline({ approvals }) {
    if (!approvals?.length) return null;

    return (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            {approvals.map((a) => {
                const Icon = STEP_ICON[a.status] ?? Clock;
                const tone =
                    a.status === 'approved' ? 'text-success'
                    : a.status === 'rejected' ? 'text-danger'
                    : a.is_current ? 'text-amber'
                    : 'text-muted';

                return (
                    <span key={a.level} className={cn('flex items-center gap-1 text-xs', tone)}>
                        <Icon className="h-3 w-3" />
                        {a.label}
                        {a.is_current && <span className="text-muted">· waiting</span>}
                        {a.acted_by && <span className="text-muted">· {a.acted_by}</span>}
                    </span>
                );
            })}
        </div>
    );
}

function RequestForm({ open, onClose, balances }) {
    const qc = useQueryClient();
    const EMPTY = { leave_type_id: '', date_from: '', date_to: '', half_day: '', reason: '' };
    const [form, setForm] = useState(EMPTY);
    const [file, setFile] = useState(null);

    const save = useMutation({
        mutationFn: () => {
            // Multipart, because an attachment may ride along.
            const body = new FormData();
            body.append('leave_type_id', form.leave_type_id);
            body.append('date_from', form.date_from);
            body.append('date_to', form.date_to || form.date_from);
            if (form.half_day) body.append('half_day', form.half_day);
            if (form.reason) body.append('reason', form.reason);
            if (file) body.append('attachment', file);

            return api.post('/leave/requests', body);
        },
        onSuccess: ({ data }) => {
            toast.success(data.message);
            // Advisory, not a failure — surface it separately so it isn't mistaken for one.
            if (data.coverage_warning) toast.warning(data.coverage_warning, { duration: 8000 });
            qc.invalidateQueries({ queryKey: ['leave', 'my'] });
            setForm(EMPTY);
            setFile(null);
            onClose();
        },
        onError: (err) => toast.error(apiError(err)),
    });

    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
    const selected = balances.find((b) => String(b.type_id) === String(form.leave_type_id));

    // A half-day only makes sense on a single date.
    const singleDay = !!form.date_from && (!form.date_to || form.date_to === form.date_from);

    return (
        <Modal open={open} onClose={onClose} title="Request leave"
            description="Weekends are excluded automatically. Your approver will be notified."
            footer={
                <div className="flex w-full justify-end gap-2">
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={() => save.mutate()} loading={save.isPending}
                        disabled={!form.leave_type_id || !form.date_from}>Submit request</Button>
                </div>
            }>
            <div className="space-y-4">
                <Field label="Leave type">
                    <Select value={form.leave_type_id} onChange={set('leave_type_id')}>
                        <option value="">Select type…</option>
                        {balances.map((b) => (
                            <option key={b.type_id} value={b.type_id}>{b.type} — {b.remaining} day(s) left</option>
                        ))}
                    </Select>
                </Field>
                {selected && selected.remaining <= 0 && (
                    <p className="text-xs text-danger">You have no remaining {selected.type} balance this year.</p>
                )}

                <Field label="Leave dates">
                    <DateRangePicker
                        value={{ from: form.date_from, to: form.date_to }}
                        onChange={(r) => setForm((f) => ({
                            ...f,
                            date_from: r.from,
                            date_to: r.to,
                            // A range can't be a half-day — clear it rather than fail server-side.
                            half_day: r.to && r.to !== r.from ? '' : f.half_day,
                        }))}
                        minDate={new Date()}
                        placeholder="Pick your leave dates"
                    />
                </Field>

                {singleDay && (
                    <Field label="Half-day" hint="Leave as “Whole day” to use the full day.">
                        <Select value={form.half_day} onChange={set('half_day')}>
                            <option value="">Whole day (1.0)</option>
                            <option value="am">Morning only (0.5)</option>
                            <option value="pm">Afternoon only (0.5)</option>
                        </Select>
                    </Field>
                )}

                <Field label="Attachment (optional)" hint="Medical certificate or supporting document. PDF, image or Word, up to 5MB.">
                    <Input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                        className="h-auto py-2"
                    />
                </Field>

                <Field label="Reason (optional)">
                    <Textarea rows={3} value={form.reason} onChange={set('reason')} placeholder="Short context for your approver" />
                </Field>
            </div>
        </Modal>
    );
}

export default function MyLeave() {
    const qc = useQueryClient();
    const [formOpen, setFormOpen] = useState(false);

    const { data, isLoading } = useQuery({ queryKey: ['leave', 'my'], queryFn: async () => (await api.get('/leave/my')).data });
    const balances = data?.balances ?? [];
    const requests = data?.requests ?? [];

    const cancel = useMutation({
        mutationFn: (id) => api.post(`/leave/requests/${id}/cancel`),
        onSuccess: ({ data }) => { toast.success(data.message); qc.invalidateQueries({ queryKey: ['leave', 'my'] }); },
        onError: (err) => toast.error(apiError(err)),
    });

    return (
        <>
            <PageHeader title="My Leave" subtitle="Balances, requests and approvals — all in one place."
                actions={<Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" /> Request leave</Button>} />

            {isLoading ? <LoadingBlock /> : (
                <>
                    {/* Balance cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        {balances.map((b, i) => {
                            const pctUsed = b.allocated > 0 ? Math.min(100, (b.used / b.allocated) * 100) : 0;
                            return (
                                <motion.div key={b.type_id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                                    <Card className="card-hover h-full p-4">
                                        <div className="flex items-center gap-1.5">
                                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: b.color }} />
                                            <p className="truncate text-[13px] font-medium text-muted">{b.type}</p>
                                        </div>
                                        <p className="mt-1 font-display text-2xl font-semibold tabular">
                                            {b.remaining}<span className="text-sm text-muted font-normal"> / {b.allocated}</span>
                                        </p>
                                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                                            <div className="h-full rounded-full transition-all" style={{ width: `${100 - pctUsed}%`, backgroundColor: b.color }} />
                                        </div>
                                        <p className="mt-1.5 text-[11px] text-muted">{b.used} used{!b.is_paid && ' · unpaid'}</p>
                                    </Card>
                                </motion.div>
                            );
                        })}
                    </div>

                    {/* Request history */}
                    <Card className="mt-6">
                        <CardBody>
                            <h3 className="mb-3 font-display font-semibold">My requests</h3>
                            {requests.length === 0 ? (
                                <EmptyState icon={CalendarClock} title="No requests yet" message="File your first leave request with the button above." />
                            ) : (
                                <div className="space-y-2">
                                    {requests.map((r) => (
                                        <div key={r.id} className="flex flex-wrap items-start gap-3 rounded-xl border border-border p-3">
                                            <span className="mt-0.5 h-8 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: r.type_color }} />

                                            <div className="min-w-0 flex-1">
                                                <p className="font-medium">
                                                    {r.type} · {r.days} day{r.days !== 1 ? 's' : ''}
                                                    {r.half_day && (
                                                        <span className="ml-1.5 text-xs font-normal text-muted">
                                                            ({r.half_day === 'am' ? 'morning' : 'afternoon'} only)
                                                        </span>
                                                    )}
                                                </p>
                                                <p className="text-xs text-muted">
                                                    {formatDate(r.date_from)}
                                                    {r.date_to !== r.date_from && ` – ${formatDate(r.date_to)}`}
                                                    {r.remarks && <span className="italic"> · “{r.remarks}”</span>}
                                                </p>

                                                {r.attachment_url && (
                                                    <a
                                                        href={r.attachment_url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="mt-1 inline-flex items-center gap-1 text-xs text-brand hover:underline"
                                                    >
                                                        <Paperclip className="h-3 w-3" />
                                                        {r.attachment_name ?? 'Attachment'}
                                                    </a>
                                                )}

                                                <ApprovalTimeline approvals={r.approvals} />
                                            </div>

                                            <Badge tone={STATUS_TONE[r.status]} className="capitalize">{r.status}</Badge>
                                            {r.status === 'pending' && (
                                                <IconButton label="Cancel request" icon={XCircle} tone="danger" onClick={() => cancel.mutate(r.id)} />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardBody>
                    </Card>
                </>
            )}

            <RequestForm open={formOpen} onClose={() => setFormOpen(false)} balances={balances} />
        </>
    );
}
