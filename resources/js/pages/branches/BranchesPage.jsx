import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Plus, Pencil, Trash2, MapPin, Clock, Users, Building2, CalendarClock, Star } from 'lucide-react';
import api, { apiError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Badge } from '@/components/ui/Badge';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { Field, Input, Select } from '@/components/ui/Field';
import { LoadingBlock, EmptyState } from '@/components/ui/States';
import { formatTime } from '@/lib/utils';

const EMPTY_BRANCH = { name: '', code: '', address: '', latitude: '', longitude: '', geofence_radius: 150, timezone: 'Asia/Manila', is_active: true };
const EMPTY_SCHEDULE = { name: '', morning_in: '08:00', morning_out: '12:00', afternoon_in: '13:00', afternoon_out: '17:00', grace_minutes: 10, is_default: false };

function BranchForm({ open, onClose, branch, onSaved }) {
    const [form, setForm] = useState(EMPTY_BRANCH);
    const isEdit = !!branch?.id;

    // Sync form when the modal opens for a different branch.
    const [seenId, setSeenId] = useState(null);
    if (open && (branch?.id ?? 'new') !== seenId) {
        setSeenId(branch?.id ?? 'new');
        setForm(branch ? { ...EMPTY_BRANCH, ...branch } : EMPTY_BRANCH);
    }

    const save = useMutation({
        mutationFn: () => {
            const payload = { ...form, latitude: form.latitude || null, longitude: form.longitude || null };
            return isEdit ? api.put(`/branches/${branch.id}`, payload) : api.post('/branches', payload);
        },
        onSuccess: ({ data }) => { toast.success(data.message); onSaved(); },
        onError: (err) => toast.error(apiError(err)),
    });

    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    return (
        <Modal open={open} onClose={onClose} title={isEdit ? 'Edit branch' : 'Add branch'}
            description="Branches scope employees, attendance and payroll."
            footer={
                <div className="flex w-full justify-end gap-2">
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!form.name || !form.code}>
                        {isEdit ? 'Save changes' : 'Add branch'}
                    </Button>
                </div>
            }>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Branch name"><Input value={form.name} onChange={set('name')} placeholder="Makati HQ" required /></Field>
                <Field label="Code"><Input value={form.code} onChange={set('code')} placeholder="MKT" required /></Field>
                <div className="sm:col-span-2">
                    <Field label="Address"><Input value={form.address ?? ''} onChange={set('address')} placeholder="Street, City" /></Field>
                </div>
                <Field label="Latitude"><Input type="number" step="any" value={form.latitude ?? ''} onChange={set('latitude')} placeholder="14.5547" /></Field>
                <Field label="Longitude"><Input type="number" step="any" value={form.longitude ?? ''} onChange={set('longitude')} placeholder="121.0244" /></Field>
                <Field label="Geofence radius (m)"><Input type="number" min="10" max="5000" value={form.geofence_radius ?? 150} onChange={set('geofence_radius')} /></Field>
                <Field label="Timezone"><Input value={form.timezone ?? ''} onChange={set('timezone')} placeholder="Asia/Manila" /></Field>
                <Field label="Status">
                    <Select value={form.is_active ? '1' : '0'} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.value === '1' }))}>
                        <option value="1">Active</option>
                        <option value="0">Inactive</option>
                    </Select>
                </Field>
            </div>
        </Modal>
    );
}

function ScheduleForm({ open, onClose, branch, schedule, onSaved }) {
    const [form, setForm] = useState(EMPTY_SCHEDULE);
    const isEdit = !!schedule?.id;

    const [seenKey, setSeenKey] = useState(null);
    const key = `${branch?.id}-${schedule?.id ?? 'new'}`;
    if (open && key !== seenKey) {
        setSeenKey(key);
        setForm(schedule ? { ...EMPTY_SCHEDULE, ...schedule } : EMPTY_SCHEDULE);
    }

    const save = useMutation({
        mutationFn: () => api.post(`/branches/${branch.id}/schedules`, { ...form, id: schedule?.id }),
        onSuccess: ({ data }) => { toast.success(data.message); onSaved(); },
        onError: (err) => toast.error(apiError(err)),
    });

    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    return (
        <Modal open={open} onClose={onClose} title={isEdit ? 'Edit schedule' : 'Add work schedule'}
            description={`${branch?.name} — the times late/undertime are computed against.`}
            footer={
                <div className="flex w-full justify-end gap-2">
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!form.name}>Save schedule</Button>
                </div>
            }>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Name"><Input value={form.name} onChange={set('name')} placeholder="Standard 8–5" required /></Field>
                <Field label="Grace period (minutes)"><Input type="number" min="0" max="120" value={form.grace_minutes} onChange={set('grace_minutes')} /></Field>
                <Field label="Morning in"><Input type="time" value={form.morning_in} onChange={set('morning_in')} /></Field>
                <Field label="Morning out"><Input type="time" value={form.morning_out} onChange={set('morning_out')} /></Field>
                <Field label="Afternoon in"><Input type="time" value={form.afternoon_in} onChange={set('afternoon_in')} /></Field>
                <Field label="Afternoon out"><Input type="time" value={form.afternoon_out} onChange={set('afternoon_out')} /></Field>
                <label className="sm:col-span-2 flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={!!form.is_default}
                        onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))}
                        className="h-4 w-4 rounded border-border accent-[var(--brand)]" />
                    Default schedule for this branch
                </label>
            </div>
        </Modal>
    );
}

export default function BranchesPage() {
    const { can } = useAuth();
    const qc = useQueryClient();
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [deleting, setDeleting] = useState(null);
    const [scheduleFor, setScheduleFor] = useState(null); // { branch, schedule }

    const { data, isLoading } = useQuery({ queryKey: ['branches'], queryFn: async () => (await api.get('/branches')).data });
    const branches = data?.data ?? [];

    const refresh = () => { qc.invalidateQueries({ queryKey: ['branches'] }); setFormOpen(false); setScheduleFor(null); };

    const del = useMutation({
        mutationFn: (id) => api.delete(`/branches/${id}`),
        onSuccess: ({ data }) => { toast.success(data.message); setDeleting(null); refresh(); },
        onError: (err) => { toast.error(apiError(err)); setDeleting(null); },
    });

    const delSchedule = useMutation({
        mutationFn: ({ branchId, scheduleId }) => api.delete(`/branches/${branchId}/schedules/${scheduleId}`),
        onSuccess: ({ data }) => { toast.success(data.message); refresh(); },
        onError: (err) => toast.error(apiError(err)),
    });

    return (
        <>
            <PageHeader title="Branches" subtitle="Locations, geofences and the work schedules attendance is measured against."
                actions={can('branches', 'create') && (
                    <Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="h-4 w-4" /> Add branch</Button>
                )} />

            {isLoading ? <LoadingBlock /> : branches.length === 0 ? (
                <EmptyState icon={Building2} title="No branches yet" message="Add your first branch to start scoping employees and attendance." />
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {branches.map((b, i) => (
                        <motion.div key={b.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                            <Card className="card-hover h-full">
                                <CardBody>
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
                                                <Building2 className="h-5 w-5" />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <h3 className="truncate font-display font-semibold">{b.name}</h3>
                                                    <Badge tone="brand">{b.code}</Badge>
                                                    {!b.is_active && <Badge tone="danger">Inactive</Badge>}
                                                </div>
                                                {b.address && <p className="mt-0.5 flex items-center gap-1 text-xs text-muted truncate"><MapPin className="h-3 w-3 shrink-0" />{b.address}</p>}
                                            </div>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-0.5">
                                            {can('branches', 'edit') && <IconButton label="Edit branch" icon={Pencil} tone="brand" onClick={() => { setEditing(b); setFormOpen(true); }} />}
                                            {can('branches', 'delete') && <IconButton label="Archive branch" icon={Trash2} tone="danger" onClick={() => setDeleting(b)} />}
                                        </div>
                                    </div>

                                    <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted">
                                        <span className="flex items-center gap-1.5"><Users className="h-4 w-4" /> {b.employees_count} employees</span>
                                        <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" /> {b.timezone}</span>
                                        {b.geofence_radius && <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" /> {b.geofence_radius}m geofence</span>}
                                    </div>

                                    {/* Work schedules */}
                                    <div className="mt-4 rounded-xl border border-border bg-surface-2/50 p-3">
                                        <div className="mb-2 flex items-center justify-between">
                                            <p className="flex items-center gap-1.5 text-xs font-medium text-muted"><CalendarClock className="h-3.5 w-3.5" /> Work schedules</p>
                                            {can('branches', 'edit') && (
                                                <button onClick={() => setScheduleFor({ branch: b, schedule: null })} className="text-xs text-brand hover:underline">+ Add</button>
                                            )}
                                        </div>
                                        {b.schedules.length === 0 ? (
                                            <p className="text-xs text-muted italic">No schedules — attendance falls back to the global default.</p>
                                        ) : (
                                            <div className="space-y-1.5">
                                                {b.schedules.map((s) => (
                                                    <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2 text-sm">
                                                        <div className="min-w-0 flex items-center gap-2">
                                                            {s.is_default && <Star className="h-3.5 w-3.5 shrink-0 text-amber fill-amber" />}
                                                            <span className="truncate font-medium">{s.name}</span>
                                                            <span className="hidden sm:inline text-xs text-muted">
                                                                {formatTime(s.morning_in)}–{formatTime(s.morning_out)} · {formatTime(s.afternoon_in)}–{formatTime(s.afternoon_out)} · grace {s.grace_minutes}m
                                                            </span>
                                                        </div>
                                                        {can('branches', 'edit') && (
                                                            <div className="flex shrink-0 items-center">
                                                                <IconButton label="Edit schedule" icon={Pencil} tone="brand" onClick={() => setScheduleFor({ branch: b, schedule: s })} />
                                                                <IconButton label="Delete schedule" icon={Trash2} tone="danger" onClick={() => delSchedule.mutate({ branchId: b.id, scheduleId: s.id })} />
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </CardBody>
                            </Card>
                        </motion.div>
                    ))}
                </div>
            )}

            <BranchForm open={formOpen} onClose={() => setFormOpen(false)} branch={editing} onSaved={refresh} />
            <ScheduleForm open={!!scheduleFor} onClose={() => setScheduleFor(null)} branch={scheduleFor?.branch} schedule={scheduleFor?.schedule} onSaved={refresh} />
            <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => del.mutate(deleting.id)}
                loading={del.isPending} title="Archive branch?" message={`“${deleting?.name}” will be archived. Branches with employees can’t be archived.`} confirmLabel="Archive" />
        </>
    );
}
