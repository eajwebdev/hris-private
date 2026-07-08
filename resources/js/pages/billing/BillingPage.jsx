import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Plus, CreditCard, Users, Building2, CheckCircle2, Trash2, Pencil, Receipt, TrendingUp } from 'lucide-react';
import api, { apiError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Badge } from '@/components/ui/Badge';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { Field, Input, Select } from '@/components/ui/Field';
import { Table, THead, TH, TBody, TR, TD } from '@/components/ui/Table';
import { useClientPagination } from '@/hooks/usePagination';
import { Pagination } from '@/components/ui/Pagination';
import { LoadingBlock, EmptyState } from '@/components/ui/States';
import { formatDate, peso } from '@/lib/utils';

const INVOICE_TONE = { paid: 'success', unpaid: 'amber', overdue: 'danger', void: 'neutral' };

function PlanForm({ open, onClose, plan }) {
    const qc = useQueryClient();
    const [form, setForm] = useState(null);
    const [seen, setSeen] = useState(null);
    if (open && plan && plan.name !== seen) {
        setSeen(plan.name);
        setForm({ plan_name: plan.name, rate_per_employee: plan.rate_per_employee, billing_cycle: plan.cycle, next_billing_at: plan.next_billing_at ?? '' });
    }

    const save = useMutation({
        mutationFn: () => api.put('/billing/plan', form),
        onSuccess: ({ data }) => { toast.success(data.message); qc.invalidateQueries({ queryKey: ['billing'] }); onClose(); },
        onError: (err) => toast.error(apiError(err)),
    });
    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    const rate = Number(form?.rate_per_employee || 0);
    const estimate = rate * (plan?.billable_employees ?? 0) * (form?.billing_cycle === 'annually' ? 12 : 1);

    return (
        <Modal open={open} onClose={onClose} title="Edit subscription plan"
            description="Billing is charged per active employee."
            footer={
                <div className="flex w-full justify-end gap-2">
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={() => save.mutate()} loading={save.isPending}>Save plan</Button>
                </div>
            }>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Plan name"><Input value={form?.plan_name ?? ''} onChange={set('plan_name')} /></Field>
                <Field label="Rate per employee" hint="Charged for every active employee">
                    <Input type="number" step="0.01" value={form?.rate_per_employee ?? ''} onChange={set('rate_per_employee')} placeholder="50" />
                </Field>
                <Field label="Billing cycle">
                    <Select value={form?.billing_cycle ?? 'monthly'} onChange={set('billing_cycle')}>
                        <option value="monthly">Monthly</option>
                        <option value="annually">Annually</option>
                    </Select>
                </Field>
                <Field label="Next billing date"><Input type="date" value={form?.next_billing_at ?? ''} onChange={set('next_billing_at')} /></Field>
            </div>
            <div className="mt-4 rounded-xl bg-brand-soft p-3.5 text-sm text-brand">
                Estimated {form?.billing_cycle === 'annually' ? 'annual' : 'monthly'} total:{' '}
                <b>{peso(estimate)}</b> = {peso(rate)} × {plan?.billable_employees ?? 0} employees{form?.billing_cycle === 'annually' ? ' × 12' : ''}
            </div>
        </Modal>
    );
}

function InvoiceForm({ open, onClose }) {
    const qc = useQueryClient();
    const today = new Date().toISOString().slice(0, 10);
    const [form, setForm] = useState({ description: 'EAJ HRIS — Professional plan', period_label: '', amount: '', issued_at: today, due_at: '' });

    const save = useMutation({
        mutationFn: () => api.post('/billing/invoices', form),
        onSuccess: ({ data }) => { toast.success(data.message); qc.invalidateQueries({ queryKey: ['billing'] }); onClose(); },
        onError: (err) => toast.error(apiError(err)),
    });
    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    return (
        <Modal open={open} onClose={onClose} title="New invoice"
            footer={
                <div className="flex w-full justify-end gap-2">
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!form.description || !form.amount}>Create invoice</Button>
                </div>
            }>
            <div className="space-y-4">
                <Field label="Description"><Input value={form.description} onChange={set('description')} /></Field>
                <div className="grid grid-cols-2 gap-4">
                    <Field label="Period label"><Input value={form.period_label} onChange={set('period_label')} placeholder="July 2026" /></Field>
                    <Field label="Amount"><Input type="number" step="0.01" value={form.amount} onChange={set('amount')} placeholder="4999" /></Field>
                    <Field label="Issued"><Input type="date" value={form.issued_at} onChange={set('issued_at')} /></Field>
                    <Field label="Due"><Input type="date" value={form.due_at} onChange={set('due_at')} min={form.issued_at} /></Field>
                </div>
            </div>
        </Modal>
    );
}

function UsageBar({ icon: Icon, label, used, total }) {
    const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
    return (
        <div>
            <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-muted"><Icon className="h-4 w-4" /> {label}</span>
                <span className="font-medium tabular">{used}{total ? ` / ${total}` : ''}</span>
            </div>
            {total > 0 && (
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
                </div>
            )}
        </div>
    );
}

export default function BillingPage() {
    const { can } = useAuth();
    const qc = useQueryClient();
    const [planOpen, setPlanOpen] = useState(false);
    const [invoiceOpen, setInvoiceOpen] = useState(false);
    const [deleting, setDeleting] = useState(null);

    const { data, isLoading } = useQuery({ queryKey: ['billing'], queryFn: async () => (await api.get('/billing')).data });
    const plan = data?.plan;
    const usage = data?.usage;
    const invoices = data?.invoices ?? [];
    const invPage = useClientPagination(invoices, 12);

    const pay = useMutation({
        mutationFn: (id) => api.post(`/billing/invoices/${id}/pay`),
        onSuccess: ({ data }) => { toast.success(data.message); qc.invalidateQueries({ queryKey: ['billing'] }); },
        onError: (err) => toast.error(apiError(err)),
    });
    const generate = useMutation({
        mutationFn: () => api.post('/billing/generate-invoice'),
        onSuccess: ({ data }) => { toast.success(data.message); qc.invalidateQueries({ queryKey: ['billing'] }); },
        onError: (err) => toast.error(apiError(err)),
    });
    const del = useMutation({
        mutationFn: (id) => api.delete(`/billing/invoices/${id}`),
        onSuccess: ({ data }) => { toast.success(data.message); setDeleting(null); qc.invalidateQueries({ queryKey: ['billing'] }); },
        onError: (err) => { toast.error(apiError(err)); setDeleting(null); },
    });

    if (isLoading) return (<><PageHeader title="Billing" subtitle="Your subscription, usage and invoices." /><LoadingBlock /></>);

    return (
        <>
            <PageHeader title="Billing" subtitle="Per-employee subscription, usage and invoices."
                actions={can('billing', 'create') && (
                    <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" onClick={() => setInvoiceOpen(true)}><Plus className="h-4 w-4" /> Manual invoice</Button>
                        <Button onClick={() => generate.mutate()} loading={generate.isPending}>
                            <Receipt className="h-4 w-4" /> Generate ({peso(plan.estimated_total)})
                        </Button>
                    </div>
                )} />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Plan card */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="lg:col-span-1">
                    <Card className="relative h-full overflow-hidden">
                        <div className="absolute inset-x-0 top-0 h-1 brand-gradient" />
                        <CardBody>
                            <div className="flex items-center justify-between">
                                <Badge tone="brand"><CreditCard className="h-3 w-3" /> Current plan</Badge>
                                {can('billing', 'edit') && <IconButton label="Edit plan" icon={Pencil} tone="brand" onClick={() => setPlanOpen(true)} />}
                            </div>
                            <h2 className="mt-3 font-display text-2xl font-bold">{plan.name}</h2>
                            <p className="mt-1">
                                <span className="font-display text-3xl font-bold tabular">{peso(plan.rate_per_employee)}</span>
                                <span className="text-muted"> / employee / {plan.cycle === 'annually' ? 'year' : 'month'}</span>
                            </p>
                            <div className="mt-3 rounded-xl bg-surface-2/60 p-3">
                                <p className="text-xs text-muted">Estimated {plan.cycle === 'annually' ? 'annual' : 'monthly'} total</p>
                                <p className="font-display text-2xl font-bold tabular">{peso(plan.estimated_total)}</p>
                                <p className="text-xs text-muted">{peso(plan.rate_per_employee)} × {plan.billable_employees} employees{plan.cycle === 'annually' ? ' × 12' : ''}</p>
                            </div>
                            {plan.next_billing_at && (
                                <p className="mt-2 text-sm text-muted">Next billing on {formatDate(plan.next_billing_at)}</p>
                            )}
                            <div className="mt-5 space-y-3 border-t border-border pt-4">
                                <UsageBar icon={Users} label="Billable employees" used={plan.billable_employees} total={0} />
                                <UsageBar icon={Building2} label="Branches" used={usage.branches} total={0} />
                                <UsageBar icon={TrendingUp} label="Active users" used={usage.active_users} total={0} />
                            </div>
                        </CardBody>
                    </Card>
                </motion.div>

                {/* Invoices */}
                <div className="lg:col-span-2">
                    <Card>
                        <CardBody className="p-0">
                            <div className="flex items-center justify-between border-b border-border p-4">
                                <div>
                                    <h3 className="font-display font-semibold flex items-center gap-2"><Receipt className="h-4 w-4 text-brand" /> Invoices</h3>
                                    {data.outstanding > 0 && <p className="text-xs text-danger mt-0.5">{peso(data.outstanding)} outstanding</p>}
                                </div>
                            </div>
                            {invoices.length === 0 ? (
                                <EmptyState icon={Receipt} title="No invoices" message="Invoices you create will appear here." />
                            ) : (
                                <>
                                <Table>
                                    <THead>
                                        <TH>Invoice</TH>
                                        <TH className="hidden sm:table-cell">Issued</TH>
                                        <TH className="text-right">Amount</TH>
                                        <TH>Status</TH>
                                        <TH className="text-right">Actions</TH>
                                    </THead>
                                    <TBody>
                                        {invPage.slice.map((inv) => (
                                            <TR key={inv.id}>
                                                <TD>
                                                    <p className="font-medium font-mono text-xs">{inv.number}</p>
                                                    <p className="text-xs text-muted">{inv.period_label ?? inv.description}</p>
                                                </TD>
                                                <TD className="hidden sm:table-cell text-muted whitespace-nowrap">{formatDate(inv.issued_at)}</TD>
                                                <TD className="text-right tabular font-medium">{peso(inv.amount)}</TD>
                                                <TD><Badge tone={INVOICE_TONE[inv.status]} className="capitalize">{inv.status}</Badge></TD>
                                                <TD>
                                                    <div className="flex items-center justify-end gap-0.5">
                                                        {inv.status !== 'paid' && can('billing', 'edit') && (
                                                            <IconButton label="Mark paid" icon={CheckCircle2} tone="brand" onClick={() => pay.mutate(inv.id)} />
                                                        )}
                                                        {can('billing', 'delete') && (
                                                            <IconButton label="Delete" icon={Trash2} tone="danger" onClick={() => setDeleting(inv)} />
                                                        )}
                                                    </div>
                                                </TD>
                                            </TR>
                                        ))}
                                    </TBody>
                                </Table>
                                <Pagination page={invPage.page} lastPage={invPage.lastPage} total={invPage.total} perPage={invPage.perPage} onPage={invPage.setPage} />
                                </>
                            )}
                        </CardBody>
                    </Card>
                </div>
            </div>

            <PlanForm open={planOpen} onClose={() => setPlanOpen(false)} plan={plan} />
            <InvoiceForm open={invoiceOpen} onClose={() => setInvoiceOpen(false)} />
            <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => del.mutate(deleting.id)}
                loading={del.isPending} title="Delete invoice?" message={`Invoice ${deleting?.number} will be removed.`} confirmLabel="Delete" />
        </>
    );
}
