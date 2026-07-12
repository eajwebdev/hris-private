import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Plus, Pencil, Trash2, Megaphone, Pin, Eye, Check, Clock } from 'lucide-react';
import api, { apiError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useBranches } from '@/hooks/useLookups';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Badge } from '@/components/ui/Badge';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Avatar } from '@/components/ui/Avatar';
import { LoadingBlock, EmptyState } from '@/components/ui/States';
import { formatDate } from '@/lib/utils';

const PRIORITY_TONE = { normal: 'neutral', important: 'amber', urgent: 'danger' };

function AnnouncementForm({ open, onClose, item }) {
    const qc = useQueryClient();
    const { data: branches } = useBranches();
    const EMPTY = { title: '', body: '', branch_id: '', is_pinned: false, priority: 'normal', publish: true };
    const [form, setForm] = useState(EMPTY);
    const isEdit = !!item?.id;

    const [seenId, setSeenId] = useState(null);
    if (open && (item?.id ?? 'new') !== seenId) {
        setSeenId(item?.id ?? 'new');
        setForm(item ? { ...EMPTY, ...item, branch_id: item.branch_id ?? '', publish: !!item.published_at } : EMPTY);
    }

    const save = useMutation({
        mutationFn: () => {
            const payload = { ...form, branch_id: form.branch_id || null };
            return isEdit ? api.put(`/announcements/${item.id}`, payload) : api.post('/announcements', payload);
        },
        onSuccess: ({ data }) => { toast.success(data.message); qc.invalidateQueries({ queryKey: ['announcements'] }); onClose(); },
        onError: (err) => toast.error(apiError(err)),
    });

    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    return (
        <Modal open={open} onClose={onClose} title={isEdit ? 'Edit announcement' : 'New announcement'}
            description="Publishing notifies every employee in the audience."
            footer={
                <div className="flex w-full items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-sm text-muted">
                        <input type="checkbox" checked={!!form.publish}
                            onChange={(e) => setForm((f) => ({ ...f, publish: e.target.checked }))}
                            className="h-4 w-4 rounded border-border accent-[var(--brand)]" />
                        Publish now
                    </label>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={onClose}>Cancel</Button>
                        <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!form.title || !form.body}>
                            {form.publish ? (isEdit ? 'Save & publish' : 'Post announcement') : 'Save draft'}
                        </Button>
                    </div>
                </div>
            }>
            <div className="space-y-4">
                <Field label="Title"><Input value={form.title} onChange={set('title')} placeholder="Holiday schedule update" /></Field>
                <Field label="Message"><Textarea rows={6} value={form.body} onChange={set('body')} placeholder="Write the announcement…" /></Field>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Field label="Audience">
                        <Select value={form.branch_id} onChange={set('branch_id')}>
                            <option value="">All branches</option>
                            {(branches ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </Select>
                    </Field>
                    <Field label="Priority">
                        <Select value={form.priority} onChange={set('priority')}>
                            <option value="normal">Normal</option>
                            <option value="important">Important</option>
                            <option value="urgent">Urgent</option>
                        </Select>
                    </Field>
                    <Field label="Pinned">
                        <Select value={form.is_pinned ? '1' : '0'} onChange={(e) => setForm((f) => ({ ...f, is_pinned: e.target.value === '1' }))}>
                            <option value="0">No</option>
                            <option value="1">Pin to top</option>
                        </Select>
                    </Field>
                </div>
            </div>
        </Modal>
    );
}

/** Who has read this announcement, and who hasn't. */
function ReadersModal({ announcement, onClose }) {
    const { data, isLoading } = useQuery({
        queryKey: ['announcements', 'readers', announcement?.id],
        queryFn: async () => (await api.get(`/announcements/${announcement.id}/readers`)).data,
        enabled: !!announcement,
    });

    const pct = data?.audience > 0 ? Math.round((data.read.length / data.audience) * 100) : 0;

    return (
        <Modal
            open={!!announcement}
            onClose={onClose}
            size="lg"
            title="Read receipts"
            description={announcement?.title}
        >
            {isLoading ? <LoadingBlock /> : (
                <div className="space-y-4">
                    <div className="rounded-xl border border-border p-3">
                        <div className="flex items-baseline justify-between">
                            <p className="text-sm font-medium">{data.read.length} of {data.audience} have read this</p>
                            <span className="tabular font-display text-lg font-semibold">{pct}%</span>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                            <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                        </div>
                    </div>

                    {[
                        { key: 'read', label: 'Read', icon: Check, rows: data.read, tone: 'text-success' },
                        { key: 'unread', label: 'Not yet read', icon: Clock, rows: data.unread, tone: 'text-muted' },
                    ].map((g) => (
                        g.rows.length > 0 && (
                            <div key={g.key}>
                                <p className={`mb-2 flex items-center gap-1.5 text-sm font-medium ${g.tone}`}>
                                    <g.icon className="h-4 w-4" /> {g.label} ({g.rows.length})
                                </p>
                                <div className="space-y-1.5">
                                    {g.rows.map((u) => (
                                        <div key={u.id} className="flex items-center gap-2.5 rounded-lg border border-border p-2">
                                            <Avatar name={u.name} size="sm" />
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-medium">{u.name}</p>
                                                <p className="truncate text-xs text-muted">{u.email}</p>
                                            </div>
                                            {u.read_at && (
                                                <span className="text-xs text-muted">{formatDate(u.read_at)}</span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )
                    ))}
                </div>
            )}
        </Modal>
    );
}

export default function AnnouncementsPage() {
    const { can } = useAuth();
    const qc = useQueryClient();
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [deleting, setDeleting] = useState(null);

    const [readersFor, setReadersFor] = useState(null);
    const { data, isLoading } = useQuery({ queryKey: ['announcements', 'admin'], queryFn: async () => (await api.get('/announcements')).data });
    const items = data?.data ?? [];

    const del = useMutation({
        mutationFn: (id) => api.delete(`/announcements/${id}`),
        onSuccess: ({ data }) => { toast.success(data.message); setDeleting(null); qc.invalidateQueries({ queryKey: ['announcements'] }); },
        onError: (err) => toast.error(apiError(err)),
    });

    return (
        <>
            <PageHeader title="Announcements" subtitle="Company news, memos and reminders — pushed to employee dashboards."
                actions={can('announcements', 'create') && (
                    <Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="h-4 w-4" /> New announcement</Button>
                )} />

            {isLoading ? <LoadingBlock /> : items.length === 0 ? (
                <EmptyState icon={Megaphone} title="Nothing posted yet" message="Your first announcement will notify every employee." />
            ) : (
                <div className="space-y-3">
                    {items.map((a, i) => (
                        <motion.div key={a.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                            <Card className="card-hover">
                                <CardBody className="flex flex-wrap items-start gap-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
                                        <Megaphone className="h-5 w-5" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            {a.is_pinned && <Pin className="h-3.5 w-3.5 text-amber" />}
                                            <h3 className="font-display font-semibold">{a.title}</h3>
                                            {a.priority !== 'normal' && <Badge tone={PRIORITY_TONE[a.priority]} className="capitalize">{a.priority}</Badge>}
                                            <Badge tone="neutral">{a.branch ?? 'All branches'}</Badge>
                                            {!a.published_at && <Badge tone="amber">Draft</Badge>}
                                        </div>
                                        <p className="mt-1 text-sm text-muted line-clamp-2 whitespace-pre-line">{a.body}</p>
                                        <p className="mt-1.5 text-xs text-muted">
                                            {a.published_at ? `Published ${formatDate(a.published_at)}` : `Created ${formatDate(a.created_at)}`}
                                            {a.created_by && ` · by ${a.created_by}`}
                                        </p>

                                        {a.published_at && (
                                            <button onClick={() => setReadersFor(a)}
                                                className="mt-1 inline-flex items-center gap-1 text-xs text-brand hover:underline">
                                                <Eye className="h-3.5 w-3.5" />
                                                {a.reads_count} read receipt{a.reads_count === 1 ? '' : 's'}
                                            </button>
                                        )}
                                    </div>
                                    <div className="flex shrink-0 items-center gap-0.5">
                                        {can('announcements', 'edit') && <IconButton label="Edit" icon={Pencil} tone="brand" onClick={() => { setEditing(a); setFormOpen(true); }} />}
                                        {can('announcements', 'delete') && <IconButton label="Delete" icon={Trash2} tone="danger" onClick={() => setDeleting(a)} />}
                                    </div>
                                </CardBody>
                            </Card>
                        </motion.div>
                    ))}
                </div>
            )}

            <AnnouncementForm open={formOpen} onClose={() => setFormOpen(false)} item={editing} />
            <ReadersModal announcement={readersFor} onClose={() => setReadersFor(null)} />
            <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => del.mutate(deleting.id)}
                loading={del.isPending} title="Delete announcement?" message={`“${deleting?.title}” will be removed for everyone.`} confirmLabel="Delete" />
        </>
    );
}
