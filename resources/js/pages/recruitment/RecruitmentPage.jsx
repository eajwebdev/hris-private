import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
    Plus, Pencil, Trash2, Briefcase, Users, ClipboardList, ExternalLink,
    FileText, GripVertical, Star, X,
} from 'lucide-react';
import api, { apiError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useBranches } from '@/hooks/useLookups';
import { useServerPagination } from '@/hooks/usePagination';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Table, THead, TH, TBody, TR, TD } from '@/components/ui/Table';
import { Pagination } from '@/components/ui/Pagination';
import { LoadingBlock, EmptyState } from '@/components/ui/States';
import { formatDate, cn, pageMeta } from '@/lib/utils';

const EMPLOYMENT = { full_time: 'Full-time', part_time: 'Part-time', contract: 'Contract', internship: 'Internship' };
const OPENING_TONE = { open: 'success', draft: 'amber', closed: 'neutral' };
const APP_TONE = { applied: 'brand', screening: 'amber', interview: 'amber', offer: 'brand', hired: 'success', rejected: 'danger', withdrawn: 'neutral' };
const APP_STATUSES = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected', 'withdrawn'];
const DEFAULT_REQS = [
    { name: 'Resume / CV', description: 'PDF or DOCX, max 5MB', is_required: true },
    { name: 'Application Letter', description: 'Cover letter addressed to HR', is_required: true },
    { name: 'Valid Government ID', description: 'Any government-issued ID', is_required: true },
    { name: 'Transcript of Records', description: 'For fresh graduates', is_required: false },
];

/* ---------------------------------------------------------------- Opening form */
function OpeningForm({ open, onClose, opening }) {
    const qc = useQueryClient();
    const { data: branches } = useBranches();
    const EMPTY = {
        title: '', branch_id: '', department: '', employment_type: 'full_time',
        location: '', salary_range: '', openings_count: 1, description: '', status: 'open',
        requirements: DEFAULT_REQS,
    };
    const [form, setForm] = useState(EMPTY);
    const isEdit = !!opening?.id;

    const [seenId, setSeenId] = useState(null);
    if (open && (opening?.id ?? 'new') !== seenId) {
        setSeenId(opening?.id ?? 'new');
        setForm(opening
            ? { ...EMPTY, ...opening, branch_id: opening.branch_id ?? '', requirements: opening.requirements?.length ? opening.requirements.map((r) => ({ name: r.name, description: r.description ?? '', is_required: r.is_required })) : DEFAULT_REQS }
            : EMPTY);
    }

    const save = useMutation({
        mutationFn: () => {
            const payload = { ...form, branch_id: form.branch_id || null, requirements: form.requirements.filter((r) => r.name.trim()) };
            return isEdit ? api.put(`/recruitment/openings/${opening.id}`, payload) : api.post('/recruitment/openings', payload);
        },
        onSuccess: ({ data }) => { toast.success(data.message); qc.invalidateQueries({ queryKey: ['recruitment'] }); onClose(); },
        onError: (err) => toast.error(apiError(err)),
    });

    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
    const setReq = (i, k, v) => setForm((f) => ({ ...f, requirements: f.requirements.map((r, idx) => idx === i ? { ...r, [k]: v } : r) }));
    const addReq = () => setForm((f) => ({ ...f, requirements: [...f.requirements, { name: '', description: '', is_required: true }] }));
    const removeReq = (i) => setForm((f) => ({ ...f, requirements: f.requirements.filter((_, idx) => idx !== i) }));

    return (
        <Modal open={open} onClose={onClose} size="lg" title={isEdit ? 'Edit job opening' : 'New job opening'}
            description="Define the role and the documents applicants must attach."
            footer={
                <div className="flex w-full justify-end gap-2">
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!form.title}>
                        {isEdit ? 'Save changes' : 'Create opening'}
                    </Button>
                </div>
            }>
            <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Job title"><Input value={form.title} onChange={set('title')} placeholder="HR Officer" /></Field>
                    <Field label="Department"><Input value={form.department ?? ''} onChange={set('department')} placeholder="Human Resources" /></Field>
                    <Field label="Branch">
                        <Select value={form.branch_id} onChange={set('branch_id')}>
                            <option value="">Company-wide</option>
                            {(branches ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </Select>
                    </Field>
                    <Field label="Employment type">
                        <Select value={form.employment_type} onChange={set('employment_type')}>
                            {Object.entries(EMPLOYMENT).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </Select>
                    </Field>
                    <Field label="Location"><Input value={form.location ?? ''} onChange={set('location')} placeholder="Makati HQ" /></Field>
                    <Field label="Salary range"><Input value={form.salary_range ?? ''} onChange={set('salary_range')} placeholder="₱25,000 – ₱35,000" /></Field>
                    <Field label="No. of openings"><Input type="number" min="1" value={form.openings_count} onChange={set('openings_count')} /></Field>
                    <Field label="Status">
                        <Select value={form.status} onChange={set('status')}>
                            <option value="open">Open (published)</option>
                            <option value="draft">Draft</option>
                            <option value="closed">Closed</option>
                        </Select>
                    </Field>
                </div>
                <Field label="Description"><Textarea rows={5} value={form.description ?? ''} onChange={set('description')} placeholder="Role summary and responsibilities…" /></Field>

                {/* Flexible required-documents editor */}
                <div className="rounded-xl border border-border p-4">
                    <div className="mb-3 flex items-center justify-between">
                        <div>
                            <p className="font-medium">Required documents</p>
                            <p className="text-xs text-muted">Applicants attach these when applying. Add, edit or remove as needed.</p>
                        </div>
                        <Button size="sm" variant="soft" onClick={addReq}><Plus className="h-4 w-4" /> Add</Button>
                    </div>
                    <div className="space-y-2">
                        {form.requirements.length === 0 && <p className="text-sm text-muted italic">No documents required.</p>}
                        {form.requirements.map((r, i) => (
                            <div key={i} className="flex flex-col gap-2 rounded-lg bg-surface-2/50 p-2.5 sm:flex-row sm:items-center">
                                <GripVertical className="hidden h-4 w-4 shrink-0 text-muted sm:block" />
                                <Input value={r.name} onChange={(e) => setReq(i, 'name', e.target.value)} placeholder="Document name" className="sm:flex-1" />
                                <Input value={r.description} onChange={(e) => setReq(i, 'description', e.target.value)} placeholder="Hint (optional)" className="sm:flex-1" />
                                <label className="flex shrink-0 items-center gap-1.5 px-1 text-xs text-muted">
                                    <input type="checkbox" checked={r.is_required} onChange={(e) => setReq(i, 'is_required', e.target.checked)}
                                        className="h-4 w-4 rounded border-border accent-[var(--brand)]" />
                                    Required
                                </label>
                                <IconButton label="Remove" icon={X} tone="danger" onClick={() => removeReq(i)} />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </Modal>
    );
}

/* -------------------------------------------------------------- Application detail */
function ApplicationDetail({ id, onClose }) {
    const qc = useQueryClient();
    const { data, isLoading } = useQuery({
        queryKey: ['recruitment', 'application', id],
        queryFn: async () => (await api.get(`/recruitment/applications/${id}`)).data,
        enabled: !!id,
    });
    const a = data?.application;
    const [status, setStatus] = useState('');
    const [rating, setRating] = useState('');
    const [notes, setNotes] = useState('');

    const [seen, setSeen] = useState(null);
    if (a && a.id !== seen) {
        setSeen(a.id);
        setStatus(a.status);
        setRating(a.rating ?? '');
        setNotes(a.hr_notes ?? '');
    }

    const update = useMutation({
        mutationFn: () => api.post(`/recruitment/applications/${id}/status`, { status, rating: rating || null, hr_notes: notes || null }),
        onSuccess: ({ data }) => { toast.success(data.message); qc.invalidateQueries({ queryKey: ['recruitment'] }); onClose(); },
        onError: (err) => toast.error(apiError(err)),
    });

    return (
        <Modal open={!!id} onClose={onClose} size="lg" title={a?.name ?? 'Application'} description={a && `${a.opening} · applied ${formatDate(a.created_at)}`}
            footer={a && (
                <div className="flex w-full justify-end gap-2">
                    <Button variant="outline" onClick={onClose}>Close</Button>
                    <Button onClick={() => update.mutate()} loading={update.isPending}>Save review</Button>
                </div>
            )}>
            {isLoading || !a ? <LoadingBlock /> : (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        <div><span className="text-muted">Email:</span> {a.email}</div>
                        <div><span className="text-muted">Phone:</span> {a.phone ?? '—'}</div>
                    </div>
                    {a.cover_letter && (
                        <div>
                            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Cover letter</p>
                            <p className="whitespace-pre-line rounded-xl bg-surface-2/50 p-3 text-sm">{a.cover_letter}</p>
                        </div>
                    )}
                    <div>
                        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Attached documents ({a.documents.length})</p>
                        {a.documents.length === 0 ? <p className="text-sm text-muted italic">No documents attached.</p> : (
                            <div className="space-y-2">
                                {a.documents.map((d) => (
                                    <a key={d.id} href={d.url} target="_blank" rel="noreferrer"
                                        className="flex items-center gap-3 rounded-xl border border-border p-3 hover:bg-surface-2 transition-colors">
                                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand"><FileText className="h-4 w-4" /></div>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-medium">{d.label}</p>
                                            <p className="truncate text-xs text-muted">{d.original_name}</p>
                                        </div>
                                        <ExternalLink className="h-4 w-4 shrink-0 text-muted" />
                                    </a>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-border pt-4">
                        <Field label="Status">
                            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                                {APP_STATUSES.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
                            </Select>
                        </Field>
                        <Field label="Rating">
                            <Select value={rating} onChange={(e) => setRating(e.target.value)}>
                                <option value="">Not rated</option>
                                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{'★'.repeat(n)} ({n})</option>)}
                            </Select>
                        </Field>
                    </div>
                    <Field label="HR notes"><Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes about this candidate" /></Field>
                </div>
            )}
        </Modal>
    );
}

/* ---------------------------------------------------------------------- Page */
export default function RecruitmentPage() {
    const { can } = useAuth();
    const qc = useQueryClient();
    const [tab, setTab] = useState('openings');
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [deleting, setDeleting] = useState(null);
    const [viewingApp, setViewingApp] = useState(null);
    const [appStatus, setAppStatus] = useState('');
    const [appOpening, setAppOpening] = useState('');

    const { data: openingsData, isLoading: loadingOpenings } = useQuery({
        queryKey: ['recruitment', 'openings'],
        queryFn: async () => (await api.get('/recruitment/openings')).data,
    });
    const openings = openingsData?.data ?? [];

    const { page, setPage } = useServerPagination(`${appStatus}|${appOpening}`);
    const { data: appsData, isLoading: loadingApps } = useQuery({
        queryKey: ['recruitment', 'applications', appStatus, appOpening, page],
        queryFn: async () => (await api.get('/recruitment/applications', { params: { status: appStatus || undefined, opening_id: appOpening || undefined, page, per_page: 15 } })).data,
        enabled: tab === 'applications',
        placeholderData: keepPreviousData,
    });
    const apps = appsData?.data ?? [];
    const appsMeta = pageMeta(appsData, 15);

    const del = useMutation({
        mutationFn: (id) => api.delete(`/recruitment/openings/${id}`),
        onSuccess: ({ data }) => { toast.success(data.message); setDeleting(null); qc.invalidateQueries({ queryKey: ['recruitment'] }); },
        onError: (err) => { toast.error(apiError(err)); setDeleting(null); },
    });

    return (
        <>
            <PageHeader title="Recruitment" subtitle="Job openings, required documents and applicant tracking."
                actions={
                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={() => window.open('/careers', '_blank')}>
                            <ExternalLink className="h-4 w-4" /> Careers portal
                        </Button>
                        {can('recruitment', 'create') && tab === 'openings' && (
                            <Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="h-4 w-4" /> New opening</Button>
                        )}
                    </div>
                } />

            {/* Tabs */}
            <div className="mb-4 flex items-center gap-1 rounded-xl bg-surface-2 p-1 w-fit">
                {[['openings', 'Openings', Briefcase], ['applications', 'Applications', ClipboardList]].map(([key, label, Icon]) => (
                    <button key={key} onClick={() => setTab(key)}
                        className={cn('flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors',
                            tab === key ? 'bg-surface shadow-sm text-foreground' : 'text-muted hover:text-foreground')}>
                        <Icon className="h-4 w-4" /> {label}
                    </button>
                ))}
            </div>

            {tab === 'openings' && (
                loadingOpenings ? <LoadingBlock /> : openings.length === 0 ? (
                    <EmptyState icon={Briefcase} title="No job openings" message="Create your first opening to start receiving applications." />
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {openings.map((o, i) => (
                            <motion.div key={o.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                                <Card className="card-hover h-full">
                                    <CardBody>
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <h3 className="font-display font-semibold">{o.title}</h3>
                                                    <Badge tone={OPENING_TONE[o.status]} className="capitalize">{o.status}</Badge>
                                                </div>
                                                <p className="mt-0.5 text-xs text-muted">
                                                    {[EMPLOYMENT[o.employment_type], o.department, o.branch ?? 'Company-wide'].filter(Boolean).join(' · ')}
                                                </p>
                                            </div>
                                            <div className="flex shrink-0 items-center gap-0.5">
                                                {can('recruitment', 'edit') && <IconButton label="Edit" icon={Pencil} tone="brand" onClick={() => { setEditing(o); setFormOpen(true); }} />}
                                                {can('recruitment', 'delete') && <IconButton label="Delete" icon={Trash2} tone="danger" onClick={() => setDeleting(o)} />}
                                            </div>
                                        </div>
                                        {o.salary_range && <p className="mt-2 text-sm font-medium text-brand">{o.salary_range}</p>}
                                        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted">
                                            <button onClick={() => { setTab('applications'); setAppOpening(String(o.id)); }} className="flex items-center gap-1.5 hover:text-foreground">
                                                <Users className="h-4 w-4" /> {o.applications_count} applicant{o.applications_count === 1 ? '' : 's'}
                                                {o.new_applications_count > 0 && <Badge tone="brand">{o.new_applications_count} new</Badge>}
                                            </button>
                                            <span className="flex items-center gap-1.5"><FileText className="h-4 w-4" /> {o.requirements.length} required docs</span>
                                        </div>
                                    </CardBody>
                                </Card>
                            </motion.div>
                        ))}
                    </div>
                )
            )}

            {tab === 'applications' && (
                <Card>
                    <CardBody className="p-0">
                        <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
                            <Select value={appOpening} onChange={(e) => setAppOpening(e.target.value)} className="w-52">
                                <option value="">All openings</option>
                                {openings.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
                            </Select>
                            <Select value={appStatus} onChange={(e) => setAppStatus(e.target.value)} className="w-44">
                                <option value="">All statuses</option>
                                {APP_STATUSES.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
                            </Select>
                        </div>
                        {loadingApps ? <LoadingBlock /> : apps.length === 0 ? (
                            <EmptyState icon={ClipboardList} title="No applications" message="Applications submitted through the careers portal appear here." />
                        ) : (
                            <>
                            <Table>
                                <THead>
                                    <TH>Applicant</TH>
                                    <TH className="hidden md:table-cell">Position</TH>
                                    <TH className="hidden sm:table-cell">Docs</TH>
                                    <TH>Status</TH>
                                    <TH className="hidden lg:table-cell">Applied</TH>
                                    <TH className="text-right">Actions</TH>
                                </THead>
                                <TBody>
                                    {apps.map((a) => (
                                        <TR key={a.id} className="cursor-pointer" onClick={() => setViewingApp(a.id)}>
                                            <TD>
                                                <div className="flex items-center gap-2.5">
                                                    <Avatar name={a.name} size="sm" />
                                                    <div className="min-w-0">
                                                        <p className="truncate font-medium">{a.name}</p>
                                                        <p className="truncate text-xs text-muted">{a.email}</p>
                                                    </div>
                                                </div>
                                            </TD>
                                            <TD className="hidden md:table-cell text-muted">{a.opening}</TD>
                                            <TD className="hidden sm:table-cell">{a.documents_count}</TD>
                                            <TD><Badge tone={APP_TONE[a.status]} className="capitalize">{a.status}</Badge></TD>
                                            <TD className="hidden lg:table-cell text-muted whitespace-nowrap">{formatDate(a.created_at)}</TD>
                                            <TD onClick={(e) => e.stopPropagation()}>
                                                <div className="flex justify-end">
                                                    <IconButton label="Review" icon={ClipboardList} tone="brand" onClick={() => setViewingApp(a.id)} />
                                                </div>
                                            </TD>
                                        </TR>
                                    ))}
                                </TBody>
                            </Table>
                            <Pagination page={appsMeta.page} lastPage={appsMeta.lastPage} total={appsMeta.total} perPage={appsMeta.perPage} onPage={setPage} />
                            </>
                        )}
                    </CardBody>
                </Card>
            )}

            <OpeningForm open={formOpen} onClose={() => setFormOpen(false)} opening={editing} />
            <ApplicationDetail id={viewingApp} onClose={() => setViewingApp(null)} />
            <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => del.mutate(deleting.id)}
                loading={del.isPending} title="Delete job opening?" message={`“${deleting?.title}” and its applications will be removed.`} confirmLabel="Delete" />
        </>
    );
}
