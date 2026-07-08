import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Gift, PlusCircle, MinusCircle, XCircle, Wallet } from 'lucide-react';
import api, { apiError } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { LoadingBlock, EmptyState } from '@/components/ui/States';
import { formatDate } from '@/lib/utils';

const STATUS_TONE = { pending: 'amber', approved: 'success', rejected: 'danger', cancelled: 'neutral' };

function RequestForm({ open, onClose, defaultType, available }) {
    const qc = useQueryClient();
    const EMPTY = { entry_type: defaultType, days: 1, service_date: new Date().toISOString().slice(0, 10), reason: '' };
    const [form, setForm] = useState(EMPTY);
    const [seen, setSeen] = useState(null);
    if (open && defaultType !== seen) { setSeen(defaultType); setForm({ ...EMPTY, entry_type: defaultType }); }

    const save = useMutation({
        mutationFn: () => api.post('/service-credits/requests', form),
        onSuccess: ({ data }) => { toast.success(data.message); qc.invalidateQueries({ queryKey: ['service-credits', 'my'] }); onClose(); },
        onError: (err) => toast.error(apiError(err)),
    });
    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
    const isUse = form.entry_type === 'use';

    return (
        <Modal open={open} onClose={onClose} title={isUse ? 'Use service credits' : 'Request service credits'}
            description={isUse ? 'Apply your credits to offset a day. Subject to HR approval.' : 'Log extra service rendered to be credited. Subject to HR approval.'}
            footer={
                <div className="flex w-full justify-end gap-2">
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!form.days || !form.service_date}>Submit request</Button>
                </div>
            }>
            <div className="space-y-4">
                <Field label="Request type">
                    <Select value={form.entry_type} onChange={set('entry_type')}>
                        <option value="earn">Earn — credit me for extra service</option>
                        <option value="use">Use — offset a day with my credits</option>
                    </Select>
                </Field>
                <div className="grid grid-cols-2 gap-4">
                    <Field label="Days" hint={isUse ? `${available} available` : 'Half-days allowed'}>
                        <Input type="number" step="0.5" min="0.5" value={form.days} onChange={set('days')} />
                    </Field>
                    <Field label={isUse ? 'Date to offset' : 'Date of service'}>
                        <Input type="date" value={form.service_date} onChange={set('service_date')} />
                    </Field>
                </div>
                {isUse && form.days > available && <p className="text-xs text-danger">You only have {available} credit day(s) available.</p>}
                <Field label="Reason"><Textarea rows={3} value={form.reason} onChange={set('reason')} placeholder={isUse ? 'Why you need to offset this day' : 'Describe the extra service rendered'} /></Field>
            </div>
        </Modal>
    );
}

export default function MyServiceCredits() {
    const qc = useQueryClient();
    const [formOpen, setFormOpen] = useState(false);
    const [defaultType, setDefaultType] = useState('earn');

    const { data, isLoading } = useQuery({ queryKey: ['service-credits', 'my'], queryFn: async () => (await api.get('/service-credits/my')).data });
    const entries = data?.entries ?? [];

    const cancel = useMutation({
        mutationFn: (id) => api.post(`/service-credits/requests/${id}/cancel`),
        onSuccess: ({ data }) => { toast.success(data.message); qc.invalidateQueries({ queryKey: ['service-credits', 'my'] }); },
        onError: (err) => toast.error(apiError(err)),
    });

    const openForm = (type) => { setDefaultType(type); setFormOpen(true); };

    return (
        <>
            <PageHeader title="My Service Credits" subtitle="Credits you've earned and used."
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" onClick={() => openForm('use')}><MinusCircle className="h-4 w-4" /> Use credits</Button>
                        <Button onClick={() => openForm('earn')}><PlusCircle className="h-4 w-4" /> Request credit</Button>
                    </div>
                } />

            {isLoading ? <LoadingBlock /> : (
                <>
                    {/* Balance cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        {[
                            { label: 'Available balance', value: data.available, icon: Wallet, tone: 'bg-brand-soft text-brand' },
                            { label: 'Total earned (approved)', value: data.balance, icon: PlusCircle, tone: 'bg-success/15 text-success' },
                            { label: 'Earned this year', value: `${data.earned_this_year} / ${data.annual_cap}`, icon: Gift, tone: 'bg-amber/15 text-amber' },
                            { label: 'Annual cap', value: data.annual_cap, icon: Gift, tone: 'bg-surface-2 text-muted' },
                        ].map((c, i) => (
                            <motion.div key={c.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                                <Card className="card-hover h-full p-4">
                                    <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${c.tone}`}><c.icon className="h-5 w-5" /></div>
                                    <p className="mt-2 font-display text-2xl font-semibold tabular">{c.value}</p>
                                    <p className="text-xs text-muted">{c.label}</p>
                                </Card>
                            </motion.div>
                        ))}
                    </div>

                    {/* History */}
                    <Card className="mt-6">
                        <CardBody>
                            <h3 className="mb-3 font-display font-semibold">History</h3>
                            {entries.length === 0 ? (
                                <EmptyState icon={Gift} title="No service credits yet" message="Request credit for extra service, or use credits to offset a day." />
                            ) : (
                                <div className="space-y-2">
                                    {entries.map((c) => (
                                        <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3">
                                            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${c.entry_type === 'earn' ? 'bg-success/15 text-success' : 'bg-amber/15 text-amber'}`}>
                                                {c.entry_type === 'earn' ? <PlusCircle className="h-5 w-5" /> : <MinusCircle className="h-5 w-5" />}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="font-medium">
                                                    {c.entry_type === 'earn' ? 'Earned' : 'Used'} {c.days} day{c.days > 1 ? 's' : ''}
                                                    {c.source === 'grant' && <span className="ml-2 text-xs text-muted">granted by HR</span>}
                                                </p>
                                                <p className="text-xs text-muted">
                                                    {formatDate(c.service_date)}{c.reason && ` · ${c.reason}`}
                                                    {c.remarks && <span className="italic"> · “{c.remarks}”</span>}
                                                </p>
                                            </div>
                                            <Badge tone={STATUS_TONE[c.status]} className="capitalize">{c.status}</Badge>
                                            {c.status === 'pending' && (
                                                <IconButton label="Cancel request" icon={XCircle} tone="danger" onClick={() => cancel.mutate(c.id)} />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardBody>
                    </Card>
                </>
            )}

            <RequestForm open={formOpen} onClose={() => setFormOpen(false)} defaultType={defaultType} available={data?.available ?? 0} />
        </>
    );
}
