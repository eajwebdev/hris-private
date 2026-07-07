import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, KeyRound, Upload, FileText, Trash2, Mail, Phone, MapPin, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import api, { apiError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, statusTone } from '@/components/ui/Badge';
import { LoadingBlock, ErrorState, EmptyState } from '@/components/ui/States';
import { IconButton } from '@/components/ui/IconButton';
import { Modal } from '@/components/ui/Modal';
import { Field, Input, Select } from '@/components/ui/Field';
import { EmployeeForm } from './EmployeeForm';
import { formatDate, peso, cn } from '@/lib/utils';

const TABS = ['Profile', 'Employment', 'Government & Bank', 'Documents'];

export default function EmployeeDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const qc = useQueryClient();
    const { can } = useAuth();
    const [tab, setTab] = useState('Profile');
    const [editOpen, setEditOpen] = useState(false);
    const [uploadOpen, setUploadOpen] = useState(false);

    const { data: e, isLoading, isError, refetch } = useQuery({
        queryKey: ['employee', id],
        queryFn: async () => (await api.get(`/employees/${id}`)).data.data,
    });

    const provisionMut = useMutation({
        mutationFn: () => api.post(`/employees/${id}/account`),
        onSuccess: ({ data }) => {
            toast.success(data.message);
            if (data.temp_password) {
                toast.message('Temporary password', { description: data.temp_password, duration: 15000 });
            }
            qc.invalidateQueries({ queryKey: ['employee', id] });
        },
        onError: (err) => toast.error(apiError(err)),
    });

    if (isLoading) return <LoadingBlock label="Loading 201 file…" />;
    if (isError) return <ErrorState onRetry={refetch} />;

    return (
        <>
            <button onClick={() => navigate('/app/employees')} className="mb-4 flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
                <ArrowLeft className="h-4 w-4" /> Back to employees
            </button>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Identity card */}
                <Card className="lg:col-span-1 h-fit">
                    <CardBody className="flex flex-col items-center text-center">
                        <Avatar name={e.full_name} src={e.photo_url} size="lg" className="h-24 w-24 text-2xl" />
                        <h2 className="mt-4 text-xl font-semibold font-display">{e.full_name}</h2>
                        <p className="text-sm text-muted">{e.position?.title ?? 'No position'}</p>
                        <div className="mt-2 flex items-center gap-2">
                            <Badge tone={statusTone(e.status)} className="capitalize">{e.status}</Badge>
                            <Badge>{e.employment_type?.replace('_', '-')}</Badge>
                        </div>
                        <p className="mt-3 font-mono text-xs text-muted">{e.employee_no || '—'}</p>

                        <div className="mt-5 w-full space-y-2 text-left text-sm">
                            <Row icon={Mail} value={e.email} />
                            <Row icon={Phone} value={e.phone} />
                            <Row icon={Building2} value={e.branch?.name} />
                            <Row icon={MapPin} value={e.address} />
                        </div>

                        <div className="mt-5 flex w-full flex-col gap-2">
                            {can('employees', 'edit') && (
                                <Button variant="outline" onClick={() => setEditOpen(true)}><Pencil className="h-4 w-4" /> Edit</Button>
                            )}
                            {can('employees', 'create') && !e.has_login && (
                                <Button variant="soft" onClick={() => provisionMut.mutate()} loading={provisionMut.isPending}>
                                    <KeyRound className="h-4 w-4" /> Create ESS login
                                </Button>
                            )}
                            {e.has_login && <p className="text-xs text-success">✓ ESS login active</p>}
                        </div>
                    </CardBody>
                </Card>

                {/* Tabbed detail */}
                <Card className="lg:col-span-2">
                    <div className="flex gap-1 overflow-x-auto border-b border-border px-3 pt-3">
                        {TABS.map((t) => (
                            <button
                                key={t}
                                onClick={() => setTab(t)}
                                className={cn(
                                    'whitespace-nowrap rounded-t-lg px-3.5 py-2 text-sm font-medium transition-colors',
                                    tab === t ? 'bg-surface-2 text-foreground' : 'text-muted hover:text-foreground'
                                )}
                            >
                                {t}
                            </button>
                        ))}
                    </div>
                    <CardBody>
                        {tab === 'Profile' && (
                            <Grid items={[
                                ['First name', e.first_name], ['Middle name', e.middle_name], ['Last name', e.last_name],
                                ['Birth date', formatDate(e.birth_date)], ['Gender', e.gender], ['Civil status', e.civil_status],
                                ['Email', e.email], ['Phone', e.phone], ['Address', e.address],
                            ]} />
                        )}
                        {tab === 'Employment' && (
                            <Grid items={[
                                ['Branch', e.branch?.name], ['Department', e.department?.name], ['Position', e.position?.title],
                                ['Reports to', e.manager?.name], ['Employment type', e.employment_type?.replace('_', '-')],
                                ['Status', e.status], ['Date hired', formatDate(e.date_hired)],
                                ['Date regularized', formatDate(e.date_regularized)], ['Basic salary', peso(e.basic_salary)],
                            ]} />
                        )}
                        {tab === 'Government & Bank' && (
                            <Grid mono items={[
                                ['TIN', e.tin], ['SSS', e.sss], ['PhilHealth', e.philhealth], ['Pag-IBIG', e.pagibig],
                                ['Bank', e.bank_name], ['Bank account', e.bank_account],
                            ]} />
                        )}
                        {tab === 'Documents' && (
                            <Documents employee={e} onChanged={() => qc.invalidateQueries({ queryKey: ['employee', id] })}
                                canEdit={can('employees', 'edit')} onUpload={() => setUploadOpen(true)} />
                        )}
                    </CardBody>
                </Card>
            </div>

            <EmployeeForm open={editOpen} onClose={() => setEditOpen(false)} employee={e}
                onSaved={() => { setEditOpen(false); qc.invalidateQueries({ queryKey: ['employee', id] }); }} />

            <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} employeeId={id}
                onDone={() => { setUploadOpen(false); qc.invalidateQueries({ queryKey: ['employee', id] }); }} />
        </>
    );
}

function Row({ icon: Icon, value }) {
    if (!value) return null;
    return (
        <div className="flex items-start gap-2 text-muted">
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="text-foreground break-words">{value}</span>
        </div>
    );
}

function Grid({ items, mono }) {
    return (
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            {items.map(([label, value]) => (
                <div key={label}>
                    <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
                    <dd className={cn('mt-0.5 text-sm text-foreground', mono && 'font-mono')}>{value || '—'}</dd>
                </div>
            ))}
        </dl>
    );
}

function Documents({ employee, canEdit, onUpload, onChanged }) {
    const del = useMutation({
        mutationFn: (docId) => api.delete(`/employees/${employee.id}/documents/${docId}`),
        onSuccess: () => { toast.success('Document removed.'); onChanged(); },
        onError: (e) => toast.error(apiError(e)),
    });
    const docs = employee.documents ?? [];

    return (
        <div>
            {canEdit && (
                <div className="mb-4 flex justify-end">
                    <Button variant="outline" size="sm" onClick={onUpload}><Upload className="h-4 w-4" /> Upload document</Button>
                </div>
            )}
            {docs.length === 0 ? (
                <EmptyState icon={FileText} title="No documents" message="Upload contracts, IDs and certificates to the vault." />
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {docs.map((d) => (
                        <div key={d.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-soft text-brand"><FileText className="h-5 w-5" /></div>
                            <div className="min-w-0 flex-1">
                                <a href={d.url} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium hover:text-brand">{d.name}</a>
                                <p className="text-xs text-muted">{d.category || 'Document'}</p>
                            </div>
                            {canEdit && <IconButton label="Delete" icon={Trash2} onClick={() => del.mutate(d.id)} />}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function UploadModal({ open, onClose, employeeId, onDone }) {
    const [name, setName] = useState('');
    const [category, setCategory] = useState('contract');
    const [file, setFile] = useState(null);

    const up = useMutation({
        mutationFn: () => {
            const fd = new FormData();
            fd.append('name', name);
            fd.append('category', category);
            fd.append('file', file);
            return api.post(`/employees/${employeeId}/documents`, fd);
        },
        onSuccess: () => { toast.success('Document uploaded.'); setName(''); setFile(null); onDone(); },
        onError: (e) => toast.error(apiError(e)),
    });

    return (
        <Modal open={open} onClose={onClose} title="Upload document" size="sm"
            footer={<><Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button onClick={() => up.mutate()} loading={up.isPending} disabled={!file || !name}>Upload</Button></>}>
            <div className="space-y-3">
                <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Employment contract" /></Field>
                <Field label="Category">
                    <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                        <option value="contract">Contract</option>
                        <option value="id">ID</option>
                        <option value="certificate">Certificate</option>
                        <option value="other">Other</option>
                    </Select>
                </Field>
                <Field label="File"><Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="pt-2" /></Field>
            </div>
        </Modal>
    );
}
