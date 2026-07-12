import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
    UserCircle, Pencil, Plus, Trash2, KeyRound, Phone, MapPin, Mail, Building2,
    BadgeCheck, CalendarDays, Gift, FileText, Users, ShieldAlert,
} from 'lucide-react';
import api, { apiError } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Badge, statusTone } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/Modal';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { LoadingBlock, EmptyState } from '@/components/ui/States';
import { formatDate } from '@/lib/utils';

/** Label/value row used across the read-only panels. */
function Row({ icon: Icon, label, value }) {
    return (
        <div className="flex items-start gap-3 py-2">
            {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted" />}
            <div className="min-w-0 flex-1">
                <p className="text-xs text-muted">{label}</p>
                <p className="break-words font-medium">{value || '—'}</p>
            </div>
        </div>
    );
}

function Panel({ title, icon: Icon, action, children }) {
    return (
        <Card>
            <CardBody>
                <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="flex items-center gap-2 font-display font-semibold">
                        {Icon && <Icon className="h-4 w-4 text-brand" />} {title}
                    </h3>
                    {action}
                </div>
                {children}
            </CardBody>
        </Card>
    );
}

/** Contact details + emergency contacts — the only parts an employee may edit. */
function EditContactForm({ open, employee, onClose }) {
    const qc = useQueryClient();
    const [form, setForm] = useState({
        phone: employee.phone ?? '',
        address: employee.address ?? '',
        emergency_contacts: (employee.emergency_contacts ?? []).map((c) => ({
            name: c.name ?? '', relationship: c.relationship ?? '', phone: c.phone ?? '', address: c.address ?? '',
        })),
    });

    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
    const setContact = (i, k, v) =>
        setForm((f) => ({ ...f, emergency_contacts: f.emergency_contacts.map((c, ci) => (ci === i ? { ...c, [k]: v } : c)) }));
    const addContact = () =>
        setForm((f) => ({ ...f, emergency_contacts: [...f.emergency_contacts, { name: '', relationship: '', phone: '', address: '' }] }));
    const removeContact = (i) =>
        setForm((f) => ({ ...f, emergency_contacts: f.emergency_contacts.filter((_, ci) => ci !== i) }));

    const save = useMutation({
        mutationFn: () => api.put('/profile', form),
        onSuccess: ({ data }) => {
            toast.success(data.message);
            qc.invalidateQueries({ queryKey: ['profile'] });
            onClose();
        },
        onError: (err) => toast.error(apiError(err)),
    });

    const valid = form.emergency_contacts.every((c) => c.name.trim() && c.phone.trim());

    return (
        <Modal
            open={open}
            onClose={onClose}
            size="lg"
            title="Edit my details"
            description="Employment details are maintained by HR. You can keep your contact information current here."
            footer={
                <div className="flex w-full justify-end gap-2">
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!valid}>Save changes</Button>
                </div>
            }
        >
            <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Mobile number">
                        <Input value={form.phone} onChange={set('phone')} placeholder="+63 9XX XXX XXXX" />
                    </Field>
                </div>
                <Field label="Home address">
                    <Textarea rows={2} value={form.address} onChange={set('address')} placeholder="Street, barangay, city" />
                </Field>

                <div>
                    <div className="mb-2 flex items-center justify-between">
                        <p className="text-sm font-medium">Emergency contacts</p>
                        {form.emergency_contacts.length < 5 && (
                            <Button variant="outline" size="sm" onClick={addContact}>
                                <Plus className="h-3.5 w-3.5" /> Add contact
                            </Button>
                        )}
                    </div>

                    {form.emergency_contacts.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted">
                            No emergency contact on file. Add at least one so we know who to call.
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {form.emergency_contacts.map((c, i) => (
                                <div key={i} className="rounded-xl border border-border p-3">
                                    <div className="flex items-start gap-2">
                                        <div className="grid flex-1 grid-cols-1 sm:grid-cols-3 gap-3">
                                            <Input value={c.name} onChange={(e) => setContact(i, 'name', e.target.value)} placeholder="Full name" />
                                            <Input value={c.relationship} onChange={(e) => setContact(i, 'relationship', e.target.value)} placeholder="Relationship" />
                                            <Input value={c.phone} onChange={(e) => setContact(i, 'phone', e.target.value)} placeholder="Contact number" />
                                        </div>
                                        <IconButton label="Remove contact" icon={Trash2} tone="danger" onClick={() => removeContact(i)} />
                                    </div>
                                    <Input className="mt-3" value={c.address} onChange={(e) => setContact(i, 'address', e.target.value)} placeholder="Address (optional)" />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
}

function ChangePasswordForm({ open, onClose }) {
    const EMPTY = { current_password: '', password: '', password_confirmation: '' };
    const [form, setForm] = useState(EMPTY);
    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    const save = useMutation({
        mutationFn: () => api.post('/profile/password', form),
        onSuccess: ({ data }) => { toast.success(data.message); setForm(EMPTY); onClose(); },
        onError: (err) => toast.error(apiError(err)),
    });

    const mismatch = form.password && form.password_confirmation && form.password !== form.password_confirmation;
    const valid = form.current_password && form.password.length >= 8 && !mismatch;

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Change password"
            footer={
                <div className="flex w-full justify-end gap-2">
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!valid}>Change password</Button>
                </div>
            }
        >
            <div className="space-y-4">
                <Field label="Current password">
                    <Input type="password" value={form.current_password} onChange={set('current_password')} />
                </Field>
                <Field label="New password" hint="At least 8 characters.">
                    <Input type="password" value={form.password} onChange={set('password')} />
                </Field>
                <Field label="Confirm new password" error={mismatch ? 'Passwords do not match.' : null}>
                    <Input type="password" value={form.password_confirmation} onChange={set('password_confirmation')} />
                </Field>
            </div>
        </Modal>
    );
}

export default function MyProfile() {
    const [editOpen, setEditOpen] = useState(false);
    const [pwOpen, setPwOpen] = useState(false);

    const { data, isLoading } = useQuery({
        queryKey: ['profile'],
        queryFn: async () => (await api.get('/profile')).data,
    });

    if (isLoading) {
        return (
            <>
                <PageHeader title="My Profile" subtitle="Your 201 file." />
                <LoadingBlock />
            </>
        );
    }

    const e = data?.employee;
    const s = data?.summary;

    if (!e) {
        return (
            <>
                <PageHeader title="My Profile" />
                <Card>
                    <CardBody>
                        <EmptyState icon={UserCircle} title="No employee record linked"
                            message="Your login isn’t connected to an employee record yet. Ask HR to link it." />
                    </CardBody>
                </Card>
            </>
        );
    }

    return (
        <>
            <PageHeader
                title="My Profile"
                subtitle="Your 201 file. Employment details are maintained by HR."
                actions={
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => setPwOpen(true)}>
                            <KeyRound className="h-4 w-4" /> Change password
                        </Button>
                        <Button onClick={() => setEditOpen(true)}>
                            <Pencil className="h-4 w-4" /> Edit my details
                        </Button>
                    </div>
                }
            />

            {/* Identity header */}
            <Card>
                <CardBody className="flex flex-wrap items-center gap-5">
                    <Avatar name={e.full_name} src={e.photo_url} size="lg" />
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="font-display text-2xl font-semibold">{e.full_name}</h2>
                            <Badge tone={statusTone(e.status)} className="capitalize">{e.status?.replace('_', ' ')}</Badge>
                        </div>
                        <p className="text-muted">
                            {e.position?.title ?? 'No position'}
                            {e.department?.name && ` · ${e.department.name}`}
                            {e.branch?.name && ` · ${e.branch.name}`}
                        </p>
                        <p className="mt-1 text-sm text-muted">
                            {e.employee_no && <span className="tabular">#{e.employee_no}</span>}
                            {e.manager?.name && <span> · reports to {e.manager.name}</span>}
                        </p>
                    </div>

                    <div className="flex gap-6">
                        {[
                            { label: 'Tenure', value: s?.tenure_years != null ? `${s.tenure_years} yrs` : '—' },
                            { label: 'Leave taken', value: `${s?.leave_taken_this_year ?? 0} d` },
                            { label: 'Credits', value: s?.service_credits ?? 0 },
                        ].map((m) => (
                            <div key={m.label} className="text-center">
                                <p className="font-display text-xl font-semibold tabular">{m.value}</p>
                                <p className="text-xs text-muted">{m.label}</p>
                            </div>
                        ))}
                    </div>
                </CardBody>
            </Card>

            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Panel title="Contact" icon={Phone}
                    action={<IconButton label="Edit contact details" icon={Pencil} onClick={() => setEditOpen(true)} />}>
                    <Row icon={Mail} label="Email" value={e.email} />
                    <Row icon={Phone} label="Mobile" value={e.phone} />
                    <Row icon={MapPin} label="Address" value={e.address} />
                </Panel>

                <Panel title="Employment" icon={Building2}>
                    <div className="grid grid-cols-2 gap-x-4">
                        <Row icon={CalendarDays} label="Date hired" value={formatDate(e.date_hired)} />
                        <Row icon={BadgeCheck} label="Regularized" value={e.date_regularized ? formatDate(e.date_regularized) : '—'} />
                        <Row icon={Building2} label="Employment type" value={e.employment_type?.replace('_', ' ')} />
                        <Row icon={Gift} label="Service credits" value={`${s?.service_credits ?? 0} day(s)`} />
                    </div>
                </Panel>

                <Panel title="Personal" icon={UserCircle}>
                    <div className="grid grid-cols-2 gap-x-4">
                        <Row label="Birth date" value={formatDate(e.birth_date)} />
                        <Row label="Gender" value={e.gender ? e.gender.charAt(0).toUpperCase() + e.gender.slice(1) : '—'} />
                        <Row label="Civil status" value={e.civil_status ? e.civil_status.charAt(0).toUpperCase() + e.civil_status.slice(1) : '—'} />
                    </div>
                </Panel>

                <Panel title="Government IDs" icon={ShieldAlert}>
                    <div className="grid grid-cols-2 gap-x-4">
                        <Row label="TIN" value={e.tin} />
                        <Row label="SSS" value={e.sss} />
                        <Row label="PhilHealth" value={e.philhealth} />
                        <Row label="Pag-IBIG" value={e.pagibig} />
                    </div>
                </Panel>

                <Panel title="Emergency contacts" icon={Users}
                    action={<IconButton label="Edit emergency contacts" icon={Pencil} onClick={() => setEditOpen(true)} />}>
                    {(e.emergency_contacts ?? []).length === 0 ? (
                        <p className="py-3 text-sm text-muted">
                            None on file. <button onClick={() => setEditOpen(true)} className="text-brand hover:underline">Add one</button> so we know who to call.
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {e.emergency_contacts.map((c) => (
                                <div key={c.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
                                    <Avatar name={c.name} size="sm" />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate font-medium">{c.name}</p>
                                        <p className="truncate text-xs text-muted">
                                            {c.relationship || 'Contact'}{c.phone && ` · ${c.phone}`}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Panel>

                <Panel title="My documents" icon={FileText}>
                    {(e.documents ?? []).length === 0 ? (
                        <p className="py-3 text-sm text-muted">No documents on file. HR uploads these to your 201.</p>
                    ) : (
                        <div className="space-y-2">
                            {e.documents.map((d) => (
                                <a key={d.id} href={d.url} target="_blank" rel="noreferrer"
                                    className="flex items-center gap-3 rounded-xl border border-border p-3 transition-colors hover:bg-surface-2">
                                    <FileText className="h-4 w-4 shrink-0 text-muted" />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate font-medium">{d.name}</p>
                                        {d.category && <p className="truncate text-xs text-muted">{d.category}</p>}
                                    </div>
                                </a>
                            ))}
                        </div>
                    )}
                </Panel>
            </div>

            {editOpen && <EditContactForm open={editOpen} employee={e} onClose={() => setEditOpen(false)} />}
            <ChangePasswordForm open={pwOpen} onClose={() => setPwOpen(false)} />
        </>
    );
}
