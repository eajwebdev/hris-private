import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, X, Plus, Pencil, CalendarClock, ClipboardList, Settings2 } from 'lucide-react';
import api, { apiError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useServerPagination, useClientPagination } from '@/hooks/usePagination';
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
import { formatDate, cn, pageMeta } from '@/lib/utils';

const PER_PAGE = 15;

const STATUS_TONE = { pending: 'amber', approved: 'success', rejected: 'danger', cancelled: 'neutral' };

function ActDialog({ request, action, onClose }) {
    const qc = useQueryClient();
    const [remarks, setRemarks] = useState('');

    const act = useMutation({
        mutationFn: () => api.post(`/leave/requests/${request.id}/act`, { action, remarks: remarks || null }),
        onSuccess: ({ data }) => {
            toast.success(data.message);
            qc.invalidateQueries({ queryKey: ['leave'] });
            qc.invalidateQueries({ queryKey: ['dashboard'] });
            onClose();
        },
        onError: (err) => toast.error(apiError(err)),
    });

    return (
        <Modal open={!!request} onClose={onClose}
            title={action === 'approve' ? 'Approve leave request?' : 'Reject leave request?'}
            description={request && `${request.employee?.name} · ${request.type} · ${formatDate(request.date_from)} – ${formatDate(request.date_to)} (${request.days} day${request.days > 1 ? 's' : ''})`}
            footer={
                <div className="flex w-full justify-end gap-2">
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button variant={action === 'approve' ? 'primary' : 'danger'} onClick={() => act.mutate()} loading={act.isPending}>
                        {action === 'approve' ? 'Approve' : 'Reject'}
                    </Button>
                </div>
            }>
            <Field label={`Remarks ${action === 'reject' ? '(recommended)' : '(optional)'}`}>
                <Textarea rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Visible to the employee" />
            </Field>
        </Modal>
    );
}

function TypeForm({ open, onClose, type }) {
    const qc = useQueryClient();
    const EMPTY = { name: '', code: '', default_days: 15, is_paid: true, color: '#d61b5d', is_active: true };
    const [form, setForm] = useState(EMPTY);

    const [seenId, setSeenId] = useState(null);
    if (open && (type?.id ?? 'new') !== seenId) {
        setSeenId(type?.id ?? 'new');
        setForm(type ? { ...EMPTY, ...type } : EMPTY);
    }

    const save = useMutation({
        mutationFn: () => api.post('/leave/types', { ...form, id: type?.id }),
        onSuccess: ({ data }) => { toast.success(data.message); qc.invalidateQueries({ queryKey: ['leave'] }); onClose(); },
        onError: (err) => toast.error(apiError(err)),
    });

    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    return (
        <Modal open={open} onClose={onClose} title={type ? 'Edit leave type' : 'Add leave type'}
            footer={
                <div className="flex w-full justify-end gap-2">
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!form.name || !form.code}>Save</Button>
                </div>
            }>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Name"><Input value={form.name} onChange={set('name')} placeholder="Vacation Leave" /></Field>
                <Field label="Code"><Input value={form.code} onChange={set('code')} placeholder="VL" /></Field>
                <Field label="Days per year"><Input type="number" min="0" max="365" value={form.default_days} onChange={set('default_days')} /></Field>
                <Field label="Paid">
                    <Select value={form.is_paid ? '1' : '0'} onChange={(e) => setForm((f) => ({ ...f, is_paid: e.target.value === '1' }))}>
                        <option value="1">Paid</option>
                        <option value="0">Unpaid</option>
                    </Select>
                </Field>
                <Field label="Color"><Input type="color" value={form.color ?? '#d61b5d'} onChange={set('color')} className="h-10 p-1" /></Field>
                <Field label="Status">
                    <Select value={form.is_active ? '1' : '0'} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.value === '1' }))}>
                        <option value="1">Active</option>
                        <option value="0">Archived</option>
                    </Select>
                </Field>
            </div>
        </Modal>
    );
}

export default function LeavePage() {
    const { can } = useAuth();
    const [tab, setTab] = useState('requests');
    const [status, setStatus] = useState('');
    const [acting, setActing] = useState(null); // { request, action }
    const [typeForm, setTypeForm] = useState(null); // false-y | { type }
    const { page, setPage } = useServerPagination(status);

    const { data: reqData, isLoading } = useQuery({
        queryKey: ['leave', 'requests', status, page],
        queryFn: async () => (await api.get('/leave/requests', { params: { status: status || undefined, per_page: PER_PAGE, page } })).data,
        placeholderData: keepPreviousData,
    });
    const { data: typesData } = useQuery({
        queryKey: ['leave', 'types'],
        queryFn: async () => (await api.get('/leave/types')).data,
        enabled: tab === 'types',
    });

    const requests = reqData?.data ?? [];
    const reqMeta = pageMeta(reqData, PER_PAGE);
    const types = typesData?.data ?? [];
    const typePage = useClientPagination(types, 10);

    return (
        <>
            <PageHeader title="Leave" subtitle="Approvals, balances and leave types." />

            {/* Tabs */}
            <div className="mb-4 flex items-center gap-1 rounded-xl bg-surface-2 p-1 w-fit">
                {[['requests', 'Requests', ClipboardList], ['types', 'Leave types', Settings2]].map(([key, label, Icon]) => (
                    <button key={key} onClick={() => setTab(key)}
                        className={cn('flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors',
                            tab === key ? 'bg-surface shadow-sm text-foreground' : 'text-muted hover:text-foreground')}>
                        <Icon className="h-4 w-4" /> {label}
                    </button>
                ))}
            </div>

            {tab === 'requests' && (
                <Card>
                    <CardBody className="p-0">
                        <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
                            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40">
                                <option value="">All statuses</option>
                                <option value="pending">Pending</option>
                                <option value="approved">Approved</option>
                                <option value="rejected">Rejected</option>
                                <option value="cancelled">Cancelled</option>
                            </Select>
                        </div>
                        {isLoading ? <LoadingBlock /> : requests.length === 0 ? (
                            <EmptyState icon={CalendarClock} title="No leave requests" message="Employee requests will land here for approval." />
                        ) : (
                            <>
                            <Table>
                                <THead>
                                    <TH>Employee</TH>
                                    <TH>Type</TH>
                                    <TH>Dates</TH>
                                    <TH className="hidden md:table-cell">Reason</TH>
                                    <TH>Status</TH>
                                    <TH className="text-right">Actions</TH>
                                </THead>
                                <TBody>
                                    {requests.map((r) => (
                                        <TR key={r.id}>
                                            <TD>
                                                <div className="flex items-center gap-2.5 min-w-0">
                                                    <Avatar name={r.employee?.name} src={r.employee?.photo_url} size="sm" />
                                                    <div className="min-w-0">
                                                        <p className="truncate font-medium">{r.employee?.name}</p>
                                                        <p className="truncate text-xs text-muted">{r.employee?.position ?? '—'}</p>
                                                    </div>
                                                </div>
                                            </TD>
                                            <TD>
                                                <span className="flex items-center gap-1.5">
                                                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: r.type_color }} />
                                                    {r.type}
                                                </span>
                                            </TD>
                                            <TD className="whitespace-nowrap">
                                                {formatDate(r.date_from, { month: 'short', day: 'numeric' })} – {formatDate(r.date_to, { month: 'short', day: 'numeric' })}
                                                <span className="ml-1 text-xs text-muted">({r.days}d)</span>
                                            </TD>
                                            <TD className="hidden md:table-cell max-w-[220px]">
                                                <p className="truncate text-muted">{r.reason ?? '—'}</p>
                                            </TD>
                                            <TD><Badge tone={STATUS_TONE[r.status]} className="capitalize">{r.status}</Badge></TD>
                                            <TD>
                                                <div className="flex items-center justify-end gap-0.5">
                                                    {r.status === 'pending' && can('leave', 'approve') && (
                                                        <>
                                                            <IconButton label="Approve" icon={Check} tone="brand" onClick={() => setActing({ request: r, action: 'approve' })} />
                                                            <IconButton label="Reject" icon={X} tone="danger" onClick={() => setActing({ request: r, action: 'reject' })} />
                                                        </>
                                                    )}
                                                    {r.status !== 'pending' && r.acted_by && (
                                                        <span className="text-xs text-muted">by {r.acted_by}</span>
                                                    )}
                                                </div>
                                            </TD>
                                        </TR>
                                    ))}
                                </TBody>
                            </Table>
                            <Pagination page={reqMeta.page} lastPage={reqMeta.lastPage} total={reqMeta.total} perPage={reqMeta.perPage} onPage={setPage} />
                            </>
                        )}
                    </CardBody>
                </Card>
            )}

            {tab === 'types' && (
                <Card>
                    <CardBody className="p-0">
                        <div className="flex items-center justify-between border-b border-border p-4">
                            <p className="text-sm text-muted">Yearly allocations employees draw from.</p>
                            {can('leave', 'edit') && (
                                <Button size="sm" onClick={() => setTypeForm({ type: null })}><Plus className="h-4 w-4" /> Add type</Button>
                            )}
                        </div>
                        <Table>
                            <THead>
                                <TH>Type</TH>
                                <TH>Code</TH>
                                <TH>Days / year</TH>
                                <TH>Paid</TH>
                                <TH>Status</TH>
                                <TH className="text-right">Actions</TH>
                            </THead>
                            <TBody>
                                {typePage.slice.map((t) => (
                                    <TR key={t.id}>
                                        <TD>
                                            <span className="flex items-center gap-1.5 font-medium">
                                                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                                                {t.name}
                                            </span>
                                        </TD>
                                        <TD className="font-mono text-xs">{t.code}</TD>
                                        <TD>{t.default_days}</TD>
                                        <TD><Badge tone={t.is_paid ? 'success' : 'neutral'}>{t.is_paid ? 'Paid' : 'Unpaid'}</Badge></TD>
                                        <TD><Badge tone={t.is_active ? 'brand' : 'neutral'}>{t.is_active ? 'Active' : 'Archived'}</Badge></TD>
                                        <TD>
                                            <div className="flex justify-end">
                                                {can('leave', 'edit') && <IconButton label="Edit type" icon={Pencil} tone="brand" onClick={() => setTypeForm({ type: t })} />}
                                            </div>
                                        </TD>
                                    </TR>
                                ))}
                            </TBody>
                        </Table>
                        <Pagination page={typePage.page} lastPage={typePage.lastPage} total={typePage.total} perPage={typePage.perPage} onPage={typePage.setPage} />
                    </CardBody>
                </Card>
            )}

            <ActDialog request={acting?.request} action={acting?.action} onClose={() => setActing(null)} />
            <TypeForm open={!!typeForm} onClose={() => setTypeForm(null)} type={typeForm?.type} />
        </>
    );
}
