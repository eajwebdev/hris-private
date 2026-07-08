import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Search, Pencil, Trash2, KeyRound, Users as UsersIcon, ShieldCheck, ChevronDown } from 'lucide-react';
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
import { Field, Input, Select } from '@/components/ui/Field';
import { Table, THead, TH, TBody, TR, TD } from '@/components/ui/Table';
import { Pagination } from '@/components/ui/Pagination';
import { LoadingBlock, EmptyState } from '@/components/ui/States';
import { pageMeta, cn } from '@/lib/utils';

function useModules() {
    return useQuery({
        queryKey: ['meta', 'modules'],
        queryFn: async () => (await api.get('/meta/modules')).data,
        staleTime: 10 * 60_000,
    });
}

/* ------------------------------------------------------------- User form */
function UserForm({ open, onClose, user }) {
    const qc = useQueryClient();
    const { data: branches } = useBranches();
    const { data: meta } = useModules();
    const presets = meta?.presets ?? {};
    const modules = meta?.modules ?? {};

    const EMPTY = { name: '', username: '', email: '', password: '', preset: 'employee', is_active: true, branch_ids: [], permissions: null };
    const [form, setForm] = useState(EMPTY);
    const [showPerms, setShowPerms] = useState(false);
    const isEdit = !!user?.id;

    const [seenId, setSeenId] = useState(null);
    if (open && (user?.id ?? 'new') !== seenId) {
        setSeenId(user?.id ?? 'new');
        setForm(user
            ? { name: user.name, username: user.username ?? '', email: user.email, password: '', preset: user.preset, is_active: user.is_active, branch_ids: user.branch_ids ?? [], permissions: user.permissions ?? null }
            : EMPTY);
        setShowPerms(false);
    }

    const isSuper = form.preset === 'super_admin';

    const save = useMutation({
        mutationFn: () => {
            const payload = { ...form, branch_ids: form.branch_ids, permissions: showPerms ? form.permissions : undefined };
            if (!payload.password) delete payload.password;
            return isEdit ? api.put(`/users/${user.id}`, payload) : api.post('/users', payload);
        },
        onSuccess: ({ data }) => { toast.success(data.message); qc.invalidateQueries({ queryKey: ['users'] }); onClose(); },
        onError: (err) => toast.error(apiError(err)),
    });

    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
    const toggleBranch = (id) => setForm((f) => ({
        ...f, branch_ids: f.branch_ids.includes(id) ? f.branch_ids.filter((b) => b !== id) : [...f.branch_ids, id],
    }));
    const togglePerm = (mod, ability) => setForm((f) => ({
        ...f,
        permissions: { ...f.permissions, [mod]: { ...f.permissions?.[mod], [ability]: !f.permissions?.[mod]?.[ability] } },
    }));

    return (
        <Modal open={open} onClose={onClose} size="lg" title={isEdit ? 'Edit user' : 'New user'}
            description="Manage login access, role and branch scope."
            footer={
                <div className="flex w-full justify-end gap-2">
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!form.name || !form.email}>
                        {isEdit ? 'Save changes' : 'Create user'}
                    </Button>
                </div>
            }>
            <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Full name"><Input value={form.name} onChange={set('name')} placeholder="Jane Dela Cruz" /></Field>
                    <Field label="Username (optional)"><Input value={form.username} onChange={set('username')} placeholder="jane.dc" /></Field>
                    <Field label="Email"><Input type="email" value={form.email} onChange={set('email')} placeholder="jane@company.com" /></Field>
                    <Field label={isEdit ? 'New password (leave blank to keep)' : 'Password (optional — auto-generated)'}>
                        <Input type="password" value={form.password} onChange={set('password')} placeholder="••••••••" autoComplete="new-password" />
                    </Field>
                    <Field label="Role preset">
                        <Select value={form.preset} onChange={set('preset')}>
                            {Object.entries(presets).map(([key, p]) => <option key={key} value={key}>{p.label}</option>)}
                        </Select>
                    </Field>
                    <Field label="Status">
                        <Select value={form.is_active ? '1' : '0'} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.value === '1' }))}>
                            <option value="1">Active</option>
                            <option value="0">Inactive</option>
                        </Select>
                    </Field>
                </div>

                {isSuper && (
                    <div className="flex items-center gap-2 rounded-xl border border-brand/30 bg-brand-soft px-3.5 py-2.5 text-sm text-brand">
                        <ShieldCheck className="h-4 w-4 shrink-0" /> SuperAdmin has full access to every module and branch.
                    </div>
                )}

                {/* Branch scope */}
                {!isSuper && (
                    <Field label="Branch access">
                        <div className="flex flex-wrap gap-2">
                            {(branches ?? []).map((b) => (
                                <button key={b.id} type="button" onClick={() => toggleBranch(b.id)}
                                    className={cn('rounded-lg border px-3 py-1.5 text-sm transition-colors',
                                        form.branch_ids.includes(b.id) ? 'border-brand bg-brand-soft text-brand' : 'border-border text-muted hover:bg-surface-2')}>
                                    {b.name}
                                </button>
                            ))}
                            {(branches ?? []).length === 0 && <p className="text-sm text-muted">No branches yet.</p>}
                        </div>
                    </Field>
                )}

                {/* Advanced permission overrides */}
                {!isSuper && (
                    <div className="rounded-xl border border-border">
                        <button type="button" onClick={() => setShowPerms((s) => !s)}
                            className="flex w-full items-center justify-between p-3.5 text-sm font-medium">
                            <span>Advanced permissions <span className="text-muted">(override the preset)</span></span>
                            <ChevronDown className={cn('h-4 w-4 transition-transform', showPerms && 'rotate-180')} />
                        </button>
                        {showPerms && form.permissions && (
                            <div className="overflow-x-auto border-t border-border p-3">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-xs uppercase tracking-wide text-muted">
                                            <th className="py-2 pr-3 font-medium">Module</th>
                                            {['view', 'create', 'edit', 'delete', 'approve', 'export'].map((a) => (
                                                <th key={a} className="px-2 py-2 text-center font-medium capitalize">{a}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {Object.entries(modules).map(([key, def]) => (
                                            <tr key={key}>
                                                <td className="py-2 pr-3 font-medium">{def.label}</td>
                                                {['view', 'create', 'edit', 'delete', 'approve', 'export'].map((ability) => (
                                                    <td key={ability} className="px-2 py-2 text-center">
                                                        {def.abilities.includes(ability) ? (
                                                            <input type="checkbox"
                                                                checked={!!form.permissions?.[key]?.[ability]}
                                                                onChange={() => togglePerm(key, ability)}
                                                                className="h-4 w-4 rounded border-border accent-[var(--brand)]" />
                                                        ) : <span className="text-muted/40">—</span>}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <p className="mt-2 text-xs text-muted">Checked = granted. Changes here override the “{presets[form.preset]?.label}” preset defaults.</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </Modal>
    );
}

/* ------------------------------------------------------------------- Page */
export default function UsersPage() {
    const { can, user: me } = useAuth();
    const qc = useQueryClient();
    const { data: meta } = useModules();
    const presets = meta?.presets ?? {};

    const [search, setSearch] = useState('');
    const [preset, setPreset] = useState('');
    const [status, setStatus] = useState('');
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [deleting, setDeleting] = useState(null);

    const { page, setPage } = useServerPagination(`${search}|${preset}|${status}`);
    const { data, isLoading } = useQuery({
        queryKey: ['users', { search, preset, status, page }],
        queryFn: async () => (await api.get('/users', { params: { search, preset, status, page, per_page: 15 } })).data,
        placeholderData: keepPreviousData,
    });
    const rows = data?.data ?? [];
    const meta2 = pageMeta(data, 15);

    const del = useMutation({
        mutationFn: (id) => api.delete(`/users/${id}`),
        onSuccess: ({ data }) => { toast.success(data.message); setDeleting(null); qc.invalidateQueries({ queryKey: ['users'] }); },
        onError: (err) => { toast.error(apiError(err)); setDeleting(null); },
    });
    const reset = useMutation({
        mutationFn: (id) => api.post(`/users/${id}/reset-password`),
        onSuccess: ({ data }) => toast.message('Temporary password', { description: data.temp_password, duration: 15000 }),
        onError: (err) => toast.error(apiError(err)),
    });

    return (
        <>
            <PageHeader title="User Management" subtitle="Logins, roles, branch access and permissions."
                actions={can('users', 'create') && (
                    <Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="h-4 w-4" /> Add user</Button>
                )} />

            <Card className="mb-4 p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, username…" className="pl-9" />
                    </div>
                    <Select value={preset} onChange={(e) => setPreset(e.target.value)} className="sm:w-48">
                        <option value="">All roles</option>
                        {Object.entries(presets).map(([key, p]) => <option key={key} value={key}>{p.label}</option>)}
                    </Select>
                    <Select value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-36">
                        <option value="">All statuses</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                    </Select>
                </div>
            </Card>

            <Card>
                {isLoading ? <LoadingBlock /> : rows.length === 0 ? (
                    <EmptyState icon={UsersIcon} title="No users found" message="Add a user to grant system access." />
                ) : (
                    <>
                    <Table>
                        <THead>
                            <TH>User</TH>
                            <TH className="hidden md:table-cell">Role</TH>
                            <TH className="hidden lg:table-cell">Branches</TH>
                            <TH>Status</TH>
                            <TH className="text-right">Actions</TH>
                        </THead>
                        <TBody>
                            {rows.map((u) => (
                                <TR key={u.id}>
                                    <TD>
                                        <div className="flex items-center gap-2.5">
                                            <Avatar name={u.name} src={u.avatar_url} size="sm" />
                                            <div className="min-w-0">
                                                <p className="truncate font-medium flex items-center gap-1.5">
                                                    {u.name}
                                                    {u.is_super_admin && <ShieldCheck className="h-3.5 w-3.5 text-brand" />}
                                                </p>
                                                <p className="truncate text-xs text-muted">{u.email}</p>
                                            </div>
                                        </div>
                                    </TD>
                                    <TD className="hidden md:table-cell">
                                        <Badge tone={u.is_super_admin ? 'brand' : 'neutral'}>{presets[u.preset]?.label ?? u.preset}</Badge>
                                    </TD>
                                    <TD className="hidden lg:table-cell text-muted text-xs">
                                        {u.is_super_admin ? 'All branches' : (u.branches.map((b) => b.code).join(', ') || '—')}
                                    </TD>
                                    <TD><Badge tone={u.is_active ? 'success' : 'neutral'}>{u.is_active ? 'Active' : 'Inactive'}</Badge></TD>
                                    <TD>
                                        <div className="flex items-center justify-end gap-0.5">
                                            {can('users', 'edit') && <IconButton label="Reset password" icon={KeyRound} onClick={() => reset.mutate(u.id)} />}
                                            {can('users', 'edit') && <IconButton label="Edit" icon={Pencil} tone="brand" onClick={() => { setEditing(u); setFormOpen(true); }} />}
                                            {can('users', 'delete') && u.id !== me?.id && <IconButton label="Deactivate" icon={Trash2} tone="danger" onClick={() => setDeleting(u)} />}
                                        </div>
                                    </TD>
                                </TR>
                            ))}
                        </TBody>
                    </Table>
                    <Pagination page={meta2.page} lastPage={meta2.lastPage} total={meta2.total} perPage={meta2.perPage} onPage={setPage} />
                    </>
                )}
            </Card>

            <UserForm open={formOpen} onClose={() => setFormOpen(false)} user={editing} />
            <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => del.mutate(deleting.id)}
                loading={del.isPending} title="Deactivate user?" message={`${deleting?.name} will lose access and be signed out everywhere.`} confirmLabel="Deactivate" />
        </>
    );
}
