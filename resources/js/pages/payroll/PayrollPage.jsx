import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Wallet, Trash2, RefreshCw, Lock, Eye, ArrowLeft, FileText, SlidersHorizontal, Pencil } from 'lucide-react';
import api, { apiError, openBlob } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useBranches } from '@/hooks/useLookups';
import { useClientPagination } from '@/hooks/usePagination';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { Field, Input, Select } from '@/components/ui/Field';
import { DateRangePicker } from '@/components/ui/DateRangePicker';
import { Table, THead, TH, TBody, TR, TD } from '@/components/ui/Table';
import { Pagination } from '@/components/ui/Pagination';
import { LoadingBlock, EmptyState } from '@/components/ui/States';
import { PayrollComponents } from './PayrollComponents';
import { formatDate, peso, minutesLabel } from '@/lib/utils';

function RunForm({ open, onClose }) {
    const qc = useQueryClient();
    const { data: branches } = useBranches();
    const today = new Date();
    const first = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
    const [form, setForm] = useState({ period_start: first, period_end: today.toISOString().slice(0, 10), branch_id: '', note: '' });

    const save = useMutation({
        mutationFn: () => api.post('/payroll/periods', { ...form, branch_id: form.branch_id || null }),
        onSuccess: ({ data }) => { toast.success(data.message); qc.invalidateQueries({ queryKey: ['payroll'] }); onClose(); },
        onError: (err) => toast.error(apiError(err)),
    });

    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    return (
        <Modal open={open} onClose={onClose} title="Run payroll"
            description="Computes gross, late/undertime deductions and net from attendance + approved paid leave."
            footer={
                <div className="flex w-full justify-end gap-2">
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={() => save.mutate()} loading={save.isPending}
                        disabled={!form.period_start || !form.period_end}>Generate draft</Button>
                </div>
            }>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Payroll period" className="sm:col-span-2">
                    <DateRangePicker
                        value={{ from: form.period_start, to: form.period_end }}
                        onChange={(r) => setForm((f) => ({ ...f, period_start: r.from, period_end: r.to }))}
                        placeholder="Select the payroll period"
                    />
                </Field>
                <Field label="Scope">
                    <Select value={form.branch_id} onChange={set('branch_id')}>
                        <option value="">All branches</option>
                        {(branches ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </Select>
                </Field>
                <Field label="Note (optional)"><Input value={form.note} onChange={set('note')} placeholder="e.g. 1st half July" /></Field>
            </div>
        </Modal>
    );
}

function PeriodDetail({ periodId, onBack }) {
    const { can } = useAuth();
    const qc = useQueryClient();
    const [confirming, setConfirming] = useState(false);

    const { data, isLoading } = useQuery({
        queryKey: ['payroll', 'period', periodId],
        queryFn: async () => (await api.get(`/payroll/periods/${periodId}`)).data,
    });

    const period = data?.period;
    const slips = data?.payslips ?? [];
    const isDraft = period?.status === 'draft';
    const refresh = () => qc.invalidateQueries({ queryKey: ['payroll'] });

    const regenerate = useMutation({
        mutationFn: () => api.post(`/payroll/periods/${periodId}/regenerate`),
        onSuccess: ({ data }) => { toast.success(data.message); refresh(); },
        onError: (err) => toast.error(apiError(err)),
    });
    const finalize = useMutation({
        mutationFn: () => api.post(`/payroll/periods/${periodId}/finalize`),
        onSuccess: ({ data }) => { toast.success(data.message); setConfirming(false); refresh(); },
        onError: (err) => { toast.error(apiError(err)); setConfirming(false); },
    });

    // Hooks must run unconditionally — keep this above the early return.
    const slipPage = useClientPagination(slips, 15);

    if (isLoading || !period) return <LoadingBlock label="Loading payroll…" />;

    const totals = slips.reduce((t, s) => ({
        gross: t.gross + s.gross_pay + s.total_earnings,
        ded: t.ded + s.total_deductions,
        net: t.net + s.net_pay,
    }), { gross: 0, ded: 0, net: 0 });

    return (
        <>
            <button onClick={onBack} className="mb-4 flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
                <ArrowLeft className="h-4 w-4" /> All payroll runs
            </button>
            <PageHeader
                title={`${formatDate(period.period_start)} – ${formatDate(period.period_end)}`}
                subtitle={`${period.branch} · ${slips.length} employees · generated by ${period.generated_by ?? '—'}`}
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={isDraft ? 'amber' : 'success'} className="capitalize">{period.status}</Badge>
                        {isDraft && can('payroll', 'edit') && (
                            <Button variant="outline" size="sm" onClick={() => regenerate.mutate()} loading={regenerate.isPending}>
                                <RefreshCw className="h-4 w-4" /> Recompute
                            </Button>
                        )}
                        {isDraft && can('payroll', 'approve') && (
                            <Button size="sm" onClick={() => setConfirming(true)}>
                                <Lock className="h-4 w-4" /> Finalize & release
                            </Button>
                        )}
                    </div>
                }
            />

            {/* Totals strip */}
            <div className="mb-4 grid grid-cols-3 gap-3">
                {[['Gross', totals.gross], ['Deductions', totals.ded], ['Net payout', totals.net]].map(([label, v]) => (
                    <Card key={label} className="p-4">
                        <p className="text-[13px] text-muted">{label}</p>
                        <p className="mt-1 font-display text-lg sm:text-2xl font-semibold tabular">{peso(v)}</p>
                    </Card>
                ))}
            </div>

            <Card>
                <CardBody className="p-0">
                    <Table>
                        <THead>
                            <TH>Employee</TH>
                            <TH className="text-right">Days</TH>
                            <TH className="text-right hidden sm:table-cell">Leave/SC</TH>
                            <TH className="text-right hidden md:table-cell">Late/UT</TH>
                            <TH className="text-right">Gross</TH>
                            <TH className="text-right hidden lg:table-cell">Earnings</TH>
                            <TH className="text-right hidden sm:table-cell">Deductions</TH>
                            <TH className="text-right">Net</TH>
                            <TH className="text-right">Payslip</TH>
                        </THead>
                        <TBody>
                            {slipPage.slice.map((s) => (
                                <TR key={s.id}>
                                    <TD>
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <Avatar name={s.employee?.name} src={s.employee?.photo_url} size="sm" />
                                            <div className="min-w-0">
                                                <p className="truncate font-medium">{s.employee?.name}</p>
                                                <p className="truncate text-xs text-muted">{s.employee?.position ?? s.employee?.employee_no ?? '—'}</p>
                                            </div>
                                        </div>
                                    </TD>
                                    <TD className="text-right tabular">{s.days_present}</TD>
                                    <TD className="text-right tabular hidden sm:table-cell">{(s.paid_leave_days + s.service_credit_days) > 0 ? (s.paid_leave_days + s.service_credit_days) : '—'}</TD>
                                    <TD className="text-right hidden md:table-cell">
                                        {s.late_minutes + s.undertime_minutes + s.early_out_minutes > 0
                                            ? <span className="text-amber">{minutesLabel(s.late_minutes + s.undertime_minutes + s.early_out_minutes)}</span>
                                            : <span className="text-muted">—</span>}
                                    </TD>
                                    <TD className="text-right tabular">{peso(s.gross_pay)}</TD>
                                    <TD className="text-right tabular hidden lg:table-cell">
                                        {s.total_earnings > 0 ? <span className="text-success">+{peso(s.total_earnings)}</span> : '—'}
                                    </TD>
                                    <TD className="text-right tabular hidden sm:table-cell">
                                        {s.total_deductions > 0 ? <span className="text-danger">−{peso(s.total_deductions)}</span> : '—'}
                                    </TD>
                                    <TD className="text-right tabular font-semibold">{peso(s.net_pay)}</TD>
                                    <TD className="text-right">
                                        <IconButton
                                            label="View payslip PDF"
                                            icon={FileText}
                                            onClick={() => openBlob(`/payroll/payslips/${s.id}/pdf`)
                                                .catch((err) => toast.error(apiError(err, 'We couldn’t open that payslip.')))}
                                        />
                                    </TD>
                                </TR>
                            ))}
                        </TBody>
                    </Table>
                    <Pagination page={slipPage.page} lastPage={slipPage.lastPage} total={slipPage.total} perPage={slipPage.perPage} onPage={slipPage.setPage} />
                </CardBody>
            </Card>

            <ConfirmDialog open={confirming} onClose={() => setConfirming(false)} onConfirm={() => finalize.mutate()}
                loading={finalize.isPending} title="Finalize this payroll?"
                message="Payslips become visible to employees and the run can no longer be edited."
                confirmLabel="Finalize & release" />
        </>
    );
}

export default function PayrollPage() {
    const { can } = useAuth();
    const qc = useQueryClient();
    const [runOpen, setRunOpen] = useState(false);
    const [viewing, setViewing] = useState(null);
    const [deleting, setDeleting] = useState(null);
    const [tab, setTab] = useState('runs');

    const { data, isLoading } = useQuery({
        queryKey: ['payroll', 'periods'],
        queryFn: async () => (await api.get('/payroll/periods')).data,
        enabled: !viewing,
    });
    const periods = data?.data ?? [];
    const periodPage = useClientPagination(periods, 15);

    const del = useMutation({
        mutationFn: (id) => api.delete(`/payroll/periods/${id}`),
        onSuccess: ({ data }) => { toast.success(data.message); setDeleting(null); qc.invalidateQueries({ queryKey: ['payroll'] }); },
        onError: (err) => { toast.error(apiError(err)); setDeleting(null); },
    });

    if (viewing) return <PeriodDetail periodId={viewing} onBack={() => setViewing(null)} />;

    const tabs = [
        { key: 'runs', label: 'Payroll runs', icon: Wallet },
        { key: 'components', label: 'Salary components', icon: SlidersHorizontal },
    ];

    return (
        <>
            <PageHeader title="Payroll" subtitle="Runs computed from attendance, exact late minutes and approved paid leave."
                actions={tab === 'runs' && can('payroll', 'create') && (
                    <Button onClick={() => setRunOpen(true)}><Plus className="h-4 w-4" /> Run payroll</Button>
                )} />

            {/* Runs vs the earning/deduction columns that feed them */}
            <div className="mb-4 flex gap-1 border-b border-border">
                {tabs.map((t) => (
                    <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                            tab === t.key
                                ? 'border-brand text-brand'
                                : 'border-transparent text-muted hover:text-foreground'
                        }`}
                    >
                        <t.icon className="h-4 w-4" /> {t.label}
                    </button>
                ))}
            </div>

            {tab === 'components' ? <PayrollComponents /> : isLoading ? <LoadingBlock /> : periods.length === 0 ? (
                <EmptyState icon={Wallet} title="No payroll runs yet" message="Generate your first run — it computes from attendance automatically." />
            ) : (
                <Card>
                    <CardBody className="p-0">
                        <Table>
                            <THead>
                                <TH>Period</TH>
                                <TH className="hidden sm:table-cell">Scope</TH>
                                <TH className="text-right">Employees</TH>
                                <TH className="text-right hidden md:table-cell">Total net</TH>
                                <TH>Status</TH>
                                <TH className="text-right">Actions</TH>
                            </THead>
                            <TBody>
                                {periodPage.slice.map((p) => (
                                    <TR key={p.id} className="cursor-pointer" onClick={() => setViewing(p.id)}>
                                        <TD>
                                            <p className="font-medium whitespace-nowrap">{formatDate(p.period_start)} – {formatDate(p.period_end)}</p>
                                            {p.note && <p className="text-xs text-muted">{p.note}</p>}
                                        </TD>
                                        <TD className="hidden sm:table-cell text-muted">{p.branch}</TD>
                                        <TD className="text-right tabular">{p.payslips_count}</TD>
                                        <TD className="text-right tabular hidden md:table-cell">{peso(p.total_net)}</TD>
                                        <TD><Badge tone={p.status === 'draft' ? 'amber' : 'success'} className="capitalize">{p.status}</Badge></TD>
                                        <TD onClick={(e) => e.stopPropagation()}>
                                            <div className="flex items-center justify-end gap-0.5">
                                                <IconButton label="View payslips" icon={Eye} onClick={() => setViewing(p.id)} />
                                                {p.status === 'draft' && can('payroll', 'delete') && (
                                                    <IconButton label="Delete draft" icon={Trash2} tone="danger" onClick={() => setDeleting(p)} />
                                                )}
                                            </div>
                                        </TD>
                                    </TR>
                                ))}
                            </TBody>
                        </Table>
                        <Pagination page={periodPage.page} lastPage={periodPage.lastPage} total={periodPage.total} perPage={periodPage.perPage} onPage={periodPage.setPage} />
                    </CardBody>
                </Card>
            )}

            <RunForm open={runOpen} onClose={() => setRunOpen(false)} />
            <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => del.mutate(deleting.id)}
                loading={del.isPending} title="Delete draft payroll?" message="The draft and its payslips will be removed." confirmLabel="Delete" />
        </>
    );
}
