import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, X, Plus, Gift, PlusCircle, MinusCircle } from 'lucide-react';
import api, { apiError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useEmployeesLookup } from '@/hooks/useLookups';
import { useServerPagination } from '@/hooks/usePagination';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/Modal';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Table, THead, TH, TBody, TR, TD } from '@/components/ui/Table';
import { Pagination } from '@/components/ui/Pagination';
import { LoadingBlock, EmptyState } from '@/components/ui/States';
import { formatDate, pageMeta } from '@/lib/utils';

const STATUS_TONE = { pending: 'amber', approved: 'success', rejected: 'danger', cancelled: 'neutral' };

function ActDialog({ entry, action, onClose }) {
    const qc = useQueryClient();
    const [remarks, setRemarks] = useState('');
    const act = useMutation({
        mutationFn: () => api.post(`/service-credits/requests/${entry.id}/act`, { action, remarks: remarks || null }),
        onSuccess: ({ data }) => {
            toast.success(data.message);
            qc.invalidateQueries({ queryKey: ['service-credits'] });
            qc.invalidateQueries({ queryKey: ['dashboard'] });
            onClose();
        },
        onError: (err) => toast.error(apiError(err)),
    });

    return (
        <Modal open={!!entry} onClose={onClose}
            title={action === 'approve' ? 'Approve request?' : 'Reject request?'}
            description={entry && `${entry.employee?.name} · ${entry.entry_type === 'earn' ? 'Earn' : 'Use'} ${entry.days} day(s) · ${formatDate(entry.service_date)}`}
            footer={
                <div className="flex w-full justify-end gap-2">
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button variant={action === 'approve' ? 'primary' : 'danger'} onClick={() => act.mutate()} loading={act.isPending}>
                        {action === 'approve' ? 'Approve' : 'Reject'}
                    </Button>
                </div>
            }>
            <Field label="Remarks (optional)">
                <Textarea rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Visible to the employee" />
            </Field>
        </Modal>
    );
}

function GrantForm({ open, onClose }) {
    const qc = useQueryClient();
    const { data: employees } = useEmployeesLookup();
    const [form, setForm] = useState({ employee_id: '', days: 1, service_date: new Date().toISOString().slice(0, 10), reason: '' });

    const save = useMutation({
        mutationFn: () => api.post('/service-credits/grant', form),
        onSuccess: ({ data }) => { toast.success(data.message); qc.invalidateQueries({ queryKey: ['service-credits'] }); onClose(); },
        onError: (err) => toast.error(apiError(err)),
    });
    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    return (
        <Modal open={open} onClose={onClose} title="Grant service credits"
            description="Directly credit an employee for extra service rendered. Auto-approved."
            footer={
                <div className="flex w-full justify-end gap-2">
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!form.employee_id || !form.days}>Grant credits</Button>
                </div>
            }>
            <div className="space-y-4">
                <Field label="Employee">
                    <Select value={form.employee_id} onChange={set('employee_id')}>
                        <option value="">Select employee…</option>
                        {(employees ?? []).map((e) => <option key={e.id} value={e.id}>{e.name}{e.employee_no ? ` · ${e.employee_no}` : ''}</option>)}
                    </Select>
                </Field>
                <div className="grid grid-cols-2 gap-4">
                    <Field label="Days" hint="Half-days allowed (0.5)"><Input type="number" step="0.5" min="0.5" value={form.days} onChange={set('days')} /></Field>
                    <Field label="Date of service"><Input type="date" value={form.service_date} onChange={set('service_date')} /></Field>
                </div>
                <Field label="Reason"><Textarea rows={3} value={form.reason} onChange={set('reason')} placeholder="e.g. Weekend company event, overtime coverage" /></Field>
            </div>
        </Modal>
    );
}

export default function ServiceCreditsPage() {
    const { can } = useAuth();
    const [status, setStatus] = useState('');
    const [type, setType] = useState('');
    const [acting, setActing] = useState(null);
    const [grantOpen, setGrantOpen] = useState(false);

    const { page, setPage } = useServerPagination(`${status}|${type}`);
    const { data, isLoading } = useQuery({
        queryKey: ['service-credits', status, type, page],
        queryFn: async () => (await api.get('/service-credits/requests', { params: { status: status || undefined, entry_type: type || undefined, page, per_page: 15 } })).data,
        placeholderData: keepPreviousData,
    });
    const rows = data?.data ?? [];
    const meta = pageMeta(data, 15);

    return (
        <>
            <PageHeader title="Service Credits" subtitle="Credits earned for extra service, and their use to offset absences."
                actions={can('service_credits', 'create') && (
                    <Button onClick={() => setGrantOpen(true)}><Plus className="h-4 w-4" /> Grant credits</Button>
                )} />

            <Card>
                <CardBody className="p-0">
                    <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
                        <Select value={type} onChange={(e) => setType(e.target.value)} className="w-40">
                            <option value="">All types</option>
                            <option value="earn">Earned</option>
                            <option value="use">Used</option>
                        </Select>
                        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40">
                            <option value="">All statuses</option>
                            <option value="pending">Pending</option>
                            <option value="approved">Approved</option>
                            <option value="rejected">Rejected</option>
                            <option value="cancelled">Cancelled</option>
                        </Select>
                    </div>
                    {isLoading ? <LoadingBlock /> : rows.length === 0 ? (
                        <EmptyState icon={Gift} title="No service credits" message="Grant credits or wait for employee requests to appear here." />
                    ) : (
                        <>
                        <Table>
                            <THead>
                                <TH>Employee</TH>
                                <TH>Type</TH>
                                <TH className="text-right">Days</TH>
                                <TH className="hidden md:table-cell">Service date</TH>
                                <TH className="hidden lg:table-cell">Reason</TH>
                                <TH>Status</TH>
                                <TH className="text-right">Actions</TH>
                            </THead>
                            <TBody>
                                {rows.map((c) => (
                                    <TR key={c.id}>
                                        <TD>
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <Avatar name={c.employee?.name} src={c.employee?.photo_url} size="sm" />
                                                <div className="min-w-0">
                                                    <p className="truncate font-medium">{c.employee?.name}</p>
                                                    <p className="truncate text-xs text-muted">{c.employee?.position ?? '—'}</p>
                                                </div>
                                            </div>
                                        </TD>
                                        <TD>
                                            {c.entry_type === 'earn'
                                                ? <span className="flex items-center gap-1.5 text-success"><PlusCircle className="h-4 w-4" /> Earn</span>
                                                : <span className="flex items-center gap-1.5 text-amber"><MinusCircle className="h-4 w-4" /> Use</span>}
                                        </TD>
                                        <TD className="text-right tabular font-medium">{c.days}</TD>
                                        <TD className="hidden md:table-cell text-muted whitespace-nowrap">{formatDate(c.service_date)}</TD>
                                        <TD className="hidden lg:table-cell max-w-[220px]"><p className="truncate text-muted">{c.reason ?? '—'}</p></TD>
                                        <TD>
                                            <Badge tone={STATUS_TONE[c.status]} className="capitalize">{c.status}</Badge>
                                            {c.source === 'grant' && c.status === 'approved' && <span className="ml-1 text-[11px] text-muted">granted</span>}
                                        </TD>
                                        <TD>
                                            <div className="flex items-center justify-end gap-0.5">
                                                {c.status === 'pending' && can('service_credits', 'approve') && (
                                                    <>
                                                        <IconButton label="Approve" icon={Check} tone="brand" onClick={() => setActing({ entry: c, action: 'approve' })} />
                                                        <IconButton label="Reject" icon={X} tone="danger" onClick={() => setActing({ entry: c, action: 'reject' })} />
                                                    </>
                                                )}
                                                {c.status !== 'pending' && c.acted_by && <span className="text-xs text-muted">by {c.acted_by}</span>}
                                            </div>
                                        </TD>
                                    </TR>
                                ))}
                            </TBody>
                        </Table>
                        <Pagination page={meta.page} lastPage={meta.lastPage} total={meta.total} perPage={meta.perPage} onPage={setPage} />
                        </>
                    )}
                </CardBody>
            </Card>

            <ActDialog entry={acting?.entry} action={acting?.action} onClose={() => setActing(null)} />
            <GrantForm open={grantOpen} onClose={() => setGrantOpen(false)} />
        </>
    );
}
