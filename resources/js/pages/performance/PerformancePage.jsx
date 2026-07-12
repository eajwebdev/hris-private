import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Target, Trash2, Pencil, Send, Star, X, PenLine, UserCheck } from 'lucide-react';
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
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Table, THead, TH, TBody, TR, TD } from '@/components/ui/Table';
import { Pagination } from '@/components/ui/Pagination';
import { LoadingBlock, EmptyState } from '@/components/ui/States';
import { formatDate, pageMeta, cn } from '@/lib/utils';

const STATUS_TONE = { draft: 'neutral', submitted: 'amber', acknowledged: 'success' };

const blankGoal = () => ({ title: '', description: '', weight: 0, rating: null, comments: '' });

const emptyForm = () => ({
    employee_id: '',
    period_label: '',
    period_start: '',
    period_end: '',
    recommendation: '',
    strengths: '',
    improvements: '',
    goals: [{ ...blankGoal(), title: 'Quality of work', weight: 40 }, { ...blankGoal(), title: 'Reliability', weight: 30 }, { ...blankGoal(), title: 'Collaboration', weight: 30 }],
});

/** 1–5 rating picker. */
function RatingPicker({ value, onChange, scale = [] }) {
    return (
        <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
                <button
                    key={n}
                    type="button"
                    onClick={() => onChange(value === n ? null : n)}
                    title={scale.find((s) => s.value === n)?.label ?? `${n}`}
                    aria-label={scale.find((s) => s.value === n)?.label ?? `Rate ${n}`}
                    aria-pressed={value === n}
                    className={cn(
                        'flex h-7 w-7 items-center justify-center rounded-md border transition-colors',
                        value != null && n <= value
                            ? 'border-brand bg-brand-soft text-brand'
                            : 'border-border text-muted hover:bg-surface-2'
                    )}
                >
                    <Star className={cn('h-3.5 w-3.5', value != null && n <= value && 'fill-current')} />
                </button>
            ))}
        </div>
    );
}

/** Overall score badge, on the 1–5 scale. */
function ScoreBadge({ rating, label }) {
    if (rating == null) return <span className="text-muted">—</span>;
    const tone = rating >= 4 ? 'success' : rating >= 3 ? 'brand' : rating >= 2 ? 'amber' : 'danger';
    return (
        <Badge tone={tone} className="gap-1.5">
            <Star className="h-3 w-3 fill-current" />
            <span className="tabular font-semibold">{rating.toFixed(2)}</span>
            {label && <span className="hidden sm:inline font-normal opacity-80">· {label}</span>}
        </Badge>
    );
}

function ReviewForm({ open, review, onClose, meta }) {
    const qc = useQueryClient();
    const { data: employees } = useEmployeesLookup();
    const editing = !!review;

    const [form, setForm] = useState(() =>
        review
            ? {
                  period_label: review.period_label,
                  period_start: review.period_start,
                  period_end: review.period_end,
                  recommendation: review.recommendation ?? '',
                  strengths: review.strengths ?? '',
                  improvements: review.improvements ?? '',
                  goals: review.goals.map((g) => ({ ...g, description: g.description ?? '', comments: g.comments ?? '' })),
                  // self_rating / self_comments ride along on each goal for display;
                  // the API preserves them by title, so they are not sent back.
              }
            : emptyForm()
    );

    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
    const setGoal = (i, k, v) => setForm((f) => ({ ...f, goals: f.goals.map((g, gi) => (gi === i ? { ...g, [k]: v } : g)) }));
    const addGoal = () => setForm((f) => ({ ...f, goals: [...f.goals, blankGoal()] }));
    const removeGoal = (i) => setForm((f) => ({ ...f, goals: f.goals.filter((_, gi) => gi !== i) }));

    const totalWeight = form.goals.reduce((sum, g) => sum + (Number(g.weight) || 0), 0);
    const weightsOk = totalWeight === 100;

    const save = useMutation({
        mutationFn: () => {
            const payload = {
                ...form,
                recommendation: form.recommendation || null,
                goals: form.goals.map((g) => ({
                    ...g,
                    weight: Number(g.weight) || 0,
                    rating: g.rating ? Number(g.rating) : null,
                })),
            };
            return editing
                ? api.put(`/performance/reviews/${review.id}`, payload)
                : api.post('/performance/reviews', payload);
        },
        onSuccess: ({ data }) => {
            toast.success(data.message);
            qc.invalidateQueries({ queryKey: ['performance'] });
            onClose();
        },
        onError: (err) => toast.error(apiError(err)),
    });

    const canSave = form.period_label && form.period_start && form.period_end && weightsOk
        && form.goals.every((g) => g.title.trim()) && (editing || form.employee_id);

    return (
        <Modal
            open={open}
            onClose={onClose}
            size="lg"
            title={editing ? `Edit review · ${review.employee?.name ?? ''}` : 'New performance review'}
            description="Score each criterion against its weight. The overall rating is the weighted average."
            footer={
                <div className="flex w-full items-center justify-between gap-2">
                    <span className={cn('text-sm', weightsOk ? 'text-muted' : 'text-danger')}>
                        Weights total {totalWeight}%{!weightsOk && ' — must be 100%'}
                    </span>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={onClose}>Cancel</Button>
                        <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!canSave}>
                            {editing ? 'Save review' : 'Create review'}
                        </Button>
                    </div>
                </div>
            }
        >
            <div className="space-y-5">
                {!editing && (
                    <Field label="Employee">
                        <Select value={form.employee_id} onChange={set('employee_id')}>
                            <option value="">Select employee…</option>
                            {(employees ?? []).map((e) => (
                                <option key={e.id} value={e.id}>{e.name}{e.employee_no ? ` · ${e.employee_no}` : ''}</option>
                            ))}
                        </Select>
                    </Field>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Field label="Review period" hint="e.g. H1 2026">
                        <Input value={form.period_label} onChange={set('period_label')} placeholder="H1 2026" />
                    </Field>
                    <Field label="From"><Input type="date" value={form.period_start} onChange={set('period_start')} /></Field>
                    <Field label="To"><Input type="date" value={form.period_end} onChange={set('period_end')} /></Field>
                </div>

                {/* Criteria */}
                <div>
                    <div className="mb-2 flex items-center justify-between">
                        <p className="text-sm font-medium">Criteria</p>
                        <Button variant="outline" size="sm" onClick={addGoal}><Plus className="h-3.5 w-3.5" /> Add criterion</Button>
                    </div>

                    <div className="space-y-3">
                        {form.goals.map((g, i) => (
                            <div key={i} className="rounded-xl border border-border p-3">
                                <div className="flex items-start gap-2">
                                    <div className="grid flex-1 grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
                                        <Input
                                            value={g.title}
                                            onChange={(e) => setGoal(i, 'title', e.target.value)}
                                            placeholder="Criterion, e.g. Quality of work"
                                        />
                                        <div className="flex items-center gap-3">
                                            <div className="flex items-center gap-1.5">
                                                <Input
                                                    type="number" min="0" max="100" value={g.weight}
                                                    onChange={(e) => setGoal(i, 'weight', e.target.value)}
                                                    className="w-20 text-right"
                                                />
                                                <span className="text-sm text-muted">%</span>
                                            </div>
                                            <RatingPicker value={g.rating} onChange={(v) => setGoal(i, 'rating', v)} scale={meta?.scale ?? []} />
                                        </div>
                                    </div>
                                    {form.goals.length > 1 && (
                                        <IconButton label="Remove criterion" icon={X} tone="danger" onClick={() => removeGoal(i)} />
                                    )}
                                </div>
                                <Textarea
                                    rows={2}
                                    className="mt-2"
                                    value={g.comments}
                                    onChange={(e) => setGoal(i, 'comments', e.target.value)}
                                    placeholder="Comments on this criterion (optional)"
                                />

                                {/* What the employee gave themselves, for comparison. */}
                                {g.self_rating != null && (
                                    <div className="mt-2 rounded-lg bg-surface-2 p-2">
                                        <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
                                            <UserCheck className="h-3.5 w-3.5" />
                                            Employee rated themselves {g.self_rating}/5
                                            {g.self_rating_label && ` · ${g.self_rating_label}`}
                                        </p>
                                        {g.self_comments && <p className="mt-1 text-xs text-muted">“{g.self_comments}”</p>}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Strengths">
                        <Textarea rows={3} value={form.strengths} onChange={set('strengths')} placeholder="What went well" />
                    </Field>
                    <Field label="Areas for improvement">
                        <Textarea rows={3} value={form.improvements} onChange={set('improvements')} placeholder="Where to focus next period" />
                    </Field>
                </div>

                <Field label="Recommendation">
                    <Select value={form.recommendation} onChange={set('recommendation')}>
                        <option value="">None</option>
                        {(meta?.recommendations ?? []).map((r) => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                    </Select>
                </Field>
            </div>
        </Modal>
    );
}

export default function PerformancePage() {
    const { can } = useAuth();
    const qc = useQueryClient();
    const [status, setStatus] = useState('');
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [submitting, setSubmitting] = useState(null);
    const [deleting, setDeleting] = useState(null);
    const [requestingSelf, setRequestingSelf] = useState(null);

    const { page, setPage } = useServerPagination(status);

    const { data: meta } = useQuery({
        queryKey: ['performance', 'meta'],
        queryFn: async () => (await api.get('/performance/meta')).data,
        staleTime: Infinity,
    });

    const { data, isLoading } = useQuery({
        queryKey: ['performance', 'reviews', status, page],
        queryFn: async () =>
            (await api.get('/performance/reviews', { params: { status: status || undefined, page, per_page: 15 } })).data,
        placeholderData: keepPreviousData,
    });

    const rows = data?.data ?? [];
    const pmeta = pageMeta(data, 15);

    const openEdit = async (row) => {
        try {
            const { data } = await api.get(`/performance/reviews/${row.id}`);
            setEditing(data.review);
            setFormOpen(true);
        } catch (err) {
            toast.error(apiError(err));
        }
    };

    const submit = useMutation({
        mutationFn: (id) => api.post(`/performance/reviews/${id}/submit`),
        onSuccess: ({ data }) => {
            toast.success(data.message);
            qc.invalidateQueries({ queryKey: ['performance'] });
            setSubmitting(null);
        },
        onError: (err) => toast.error(apiError(err)),
    });

    const requestSelf = useMutation({
        mutationFn: (id) => api.post(`/performance/reviews/${id}/request-self-appraisal`),
        onSuccess: ({ data }) => {
            toast.success(data.message);
            qc.invalidateQueries({ queryKey: ['performance'] });
            setRequestingSelf(null);
        },
        onError: (err) => { toast.error(apiError(err)); setRequestingSelf(null); },
    });

    const remove = useMutation({
        mutationFn: (id) => api.delete(`/performance/reviews/${id}`),
        onSuccess: ({ data }) => {
            toast.success(data.message);
            qc.invalidateQueries({ queryKey: ['performance'] });
            setDeleting(null);
        },
        onError: (err) => toast.error(apiError(err)),
    });

    return (
        <>
            <PageHeader
                title="Performance"
                subtitle="Appraisals scored against weighted criteria, released to employees for acknowledgement."
                actions={can('performance', 'create') && (
                    <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
                        <Plus className="h-4 w-4" /> New review
                    </Button>
                )}
            />

            <Card>
                <CardBody className="p-0">
                    <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
                        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-44">
                            <option value="">All statuses</option>
                            <option value="draft">Draft</option>
                            <option value="submitted">Submitted</option>
                            <option value="acknowledged">Acknowledged</option>
                        </Select>
                    </div>

                    {isLoading ? <LoadingBlock /> : rows.length === 0 ? (
                        <EmptyState icon={Target} title="No performance reviews"
                            message="Create a review to score an employee against weighted criteria." />
                    ) : (
                        <>
                            <Table>
                                <THead>
                                    <TH>Employee</TH>
                                    <TH>Period</TH>
                                    <TH>Overall</TH>
                                    <TH className="hidden lg:table-cell">Self-appraisal</TH>
                                    <TH className="hidden lg:table-cell">Recommendation</TH>
                                    <TH className="hidden md:table-cell">Reviewer</TH>
                                    <TH>Status</TH>
                                    <TH className="text-right">Actions</TH>
                                </THead>
                                <TBody>
                                    {rows.map((r) => (
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
                                                <p className="font-medium whitespace-nowrap">{r.period_label}</p>
                                                <p className="text-xs text-muted whitespace-nowrap">
                                                    {formatDate(r.period_start)} – {formatDate(r.period_end)}
                                                </p>
                                            </TD>
                                            <TD><ScoreBadge rating={r.overall_rating} label={r.rating_label} /></TD>
                                            <TD className="hidden lg:table-cell">
                                                {r.self_appraisal_status === 'done'
                                                    ? <Badge tone="success">Submitted</Badge>
                                                    : r.self_appraisal_status === 'pending'
                                                        ? <Badge tone="amber">Requested</Badge>
                                                        : <span className="text-muted">—</span>}
                                            </TD>
                                            <TD className="hidden lg:table-cell text-muted">{r.recommendation_label ?? '—'}</TD>
                                            <TD className="hidden md:table-cell text-muted">{r.reviewer ?? '—'}</TD>
                                            <TD><Badge tone={STATUS_TONE[r.status]} className="capitalize">{r.status}</Badge></TD>
                                            <TD>
                                                <div className="flex items-center justify-end gap-0.5">
                                                    {r.status !== 'acknowledged' && can('performance', 'edit') && (
                                                        <IconButton label="Edit" icon={Pencil} onClick={() => openEdit(r)} />
                                                    )}
                                                    {r.status === 'draft' && r.self_appraisal_status === 'none' && can('performance', 'edit') && (
                                                        <IconButton label="Request self-appraisal" icon={PenLine}
                                                            onClick={() => setRequestingSelf(r)} />
                                                    )}
                                                    {r.status === 'draft' && can('performance', 'approve') && (
                                                        <IconButton label="Submit to employee" icon={Send} tone="brand" onClick={() => setSubmitting(r)} />
                                                    )}
                                                    {r.status !== 'acknowledged' && can('performance', 'delete') && (
                                                        <IconButton label="Delete" icon={Trash2} tone="danger" onClick={() => setDeleting(r)} />
                                                    )}
                                                </div>
                                            </TD>
                                        </TR>
                                    ))}
                                </TBody>
                            </Table>
                            <Pagination page={pmeta.page} lastPage={pmeta.lastPage} total={pmeta.total} perPage={pmeta.perPage} onPage={setPage} />
                        </>
                    )}
                </CardBody>
            </Card>

            {formOpen && (
                <ReviewForm
                    open={formOpen}
                    review={editing}
                    meta={meta}
                    onClose={() => { setFormOpen(false); setEditing(null); }}
                />
            )}

            <ConfirmDialog
                open={!!requestingSelf}
                title="Request a self-appraisal?"
                message={requestingSelf ? `${requestingSelf.employee?.name} will be asked to score themselves against these criteria. They won't see your scores until you release the review.` : ''}
                confirmLabel="Request self-appraisal"
                danger={false}
                loading={requestSelf.isPending}
                onConfirm={() => requestSelf.mutate(requestingSelf.id)}
                onClose={() => setRequestingSelf(null)}
            />

            <ConfirmDialog
                open={!!submitting}
                title="Submit review to employee?"
                message={submitting ? `${submitting.employee?.name} will be notified and can acknowledge their ${submitting.period_label} review. Every criterion must be rated first.` : ''}
                confirmLabel="Submit review"
                danger={false}
                loading={submit.isPending}
                onConfirm={() => submit.mutate(submitting.id)}
                onClose={() => setSubmitting(null)}
            />

            <ConfirmDialog
                open={!!deleting}
                title="Delete this review?"
                message={deleting ? `The ${deleting.period_label} review for ${deleting.employee?.name} will be permanently removed.` : ''}
                confirmLabel="Delete"
                loading={remove.isPending}
                onConfirm={() => remove.mutate(deleting.id)}
                onClose={() => setDeleting(null)}
            />
        </>
    );
}
