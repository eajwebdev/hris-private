import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Star, Paperclip, UserPlus, CheckCircle2, GripVertical, Users } from 'lucide-react';
import api, { apiError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useBranches, useDepartments, usePositions, useEmployeesLookup } from '@/hooks/useLookups';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/Modal';
import { Field, Input, Select } from '@/components/ui/Field';
import { LoadingBlock, EmptyState } from '@/components/ui/States';
import { cn, formatDate } from '@/lib/utils';

const COLUMN_TONE = {
    applied: 'border-t-muted',
    screening: 'border-t-amber',
    interview: 'border-t-amber',
    offer: 'border-t-brand',
    hired: 'border-t-success',
    rejected: 'border-t-danger',
    withdrawn: 'border-t-border',
};

/** Turn a hired applicant into a 201 record. */
function ConvertForm({ application, onClose }) {
    const qc = useQueryClient();
    const { data: branches } = useBranches();
    const { data: departments } = useDepartments();
    const { data: positions } = usePositions();
    const { data: employees } = useEmployeesLookup();

    const [form, setForm] = useState({
        branch_id: '',
        department_id: '',
        position_id: '',
        manager_id: '',
        employee_no: '',
        employment_type: 'full_time',
        date_hired: new Date().toISOString().slice(0, 10),
        basic_salary: '',
    });

    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    const convert = useMutation({
        mutationFn: () => api.post(`/recruitment/applications/${application.id}/convert`, {
            ...form,
            department_id: form.department_id || null,
            position_id: form.position_id || null,
            manager_id: form.manager_id || null,
            employee_no: form.employee_no || null,
            basic_salary: Number(form.basic_salary) || 0,
        }),
        onSuccess: ({ data }) => {
            toast.success(data.message);
            qc.invalidateQueries({ queryKey: ['recruitment'] });
            qc.invalidateQueries({ queryKey: ['employees'] });
            onClose();
        },
        onError: (err) => toast.error(apiError(err)),
    });

    const valid = form.branch_id && form.date_hired && form.basic_salary !== '';

    return (
        <Modal
            open={!!application}
            onClose={onClose}
            size="lg"
            title={`Add ${application?.name} to Employees`}
            description="Their uploaded documents are copied into the 201 document vault. They start as probationary."
            footer={
                <div className="flex w-full justify-end gap-2">
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={() => convert.mutate()} loading={convert.isPending} disabled={!valid}>
                        <UserPlus className="h-4 w-4" /> Create 201 record
                    </Button>
                </div>
            }
        >
            <div className="space-y-4">
                <div className="rounded-xl border border-border p-3 text-sm">
                    <p className="font-medium">{application?.name}</p>
                    <p className="text-muted">{application?.email}{application?.phone && ` · ${application.phone}`}</p>
                    <p className="mt-1 text-xs text-muted">
                        Applied for {application?.opening} · {application?.documents_count ?? 0} document(s) will be carried over
                    </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Branch">
                        <Select value={form.branch_id} onChange={set('branch_id')}>
                            <option value="">Select branch…</option>
                            {(branches ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </Select>
                    </Field>
                    <Field label="Department">
                        <Select value={form.department_id} onChange={set('department_id')}>
                            <option value="">Unassigned</option>
                            {(departments ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </Select>
                    </Field>
                    <Field label="Position">
                        <Select value={form.position_id} onChange={set('position_id')}>
                            <option value="">Unassigned</option>
                            {(positions ?? []).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                        </Select>
                    </Field>
                    <Field label="Reports to">
                        <Select value={form.manager_id} onChange={set('manager_id')}>
                            <option value="">No manager</option>
                            {(employees ?? []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                        </Select>
                    </Field>
                    <Field label="Employee no." hint="Leave blank to assign later.">
                        <Input value={form.employee_no} onChange={set('employee_no')} placeholder="MKT-1042" />
                    </Field>
                    <Field label="Employment type">
                        <Select value={form.employment_type} onChange={set('employment_type')}>
                            <option value="full_time">Full-time</option>
                            <option value="part_time">Part-time</option>
                            <option value="contract">Contract</option>
                            <option value="internship">Internship</option>
                        </Select>
                    </Field>
                    <Field label="Date hired">
                        <Input type="date" value={form.date_hired} onChange={set('date_hired')} />
                    </Field>
                    <Field label="Monthly basic salary">
                        <Input type="number" min="0" step="0.01" value={form.basic_salary} onChange={set('basic_salary')} placeholder="25000" />
                    </Field>
                </div>
            </div>
        </Modal>
    );
}

function ApplicantCard({ application, onConvert, onStage, canEdit, canHire, statuses, dragging, onDragStart, onDragEnd }) {
    const a = application;

    return (
        <div
            draggable={canEdit}
            onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart(a); }}
            onDragEnd={onDragEnd}
            className={cn(
                'rounded-xl border border-border bg-surface p-3 transition-opacity',
                canEdit && 'cursor-grab active:cursor-grabbing',
                dragging && 'opacity-40'
            )}
        >
            <div className="flex items-start gap-2">
                {canEdit && <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted" />}
                <Avatar name={a.name} size="sm" />
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{a.name}</p>
                    <p className="truncate text-xs text-muted">{a.opening}</p>
                </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                {a.rating && (
                    <span className="flex items-center gap-0.5 text-amber">
                        <Star className="h-3 w-3 fill-current" /> {a.rating}
                    </span>
                )}
                {a.documents_count > 0 && (
                    <span className="flex items-center gap-0.5"><Paperclip className="h-3 w-3" /> {a.documents_count}</span>
                )}
                <span>{formatDate(a.created_at, { month: 'short', day: 'numeric' })}</span>
            </div>

            {/* Keyboard-accessible equivalent of dragging the card. */}
            {canEdit && (
                <Select
                    value={a.status}
                    onChange={(e) => onStage(a, e.target.value)}
                    className="mt-2 h-8 text-xs"
                    aria-label={`Move ${a.name} to another stage`}
                >
                    {statuses.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </Select>
            )}

            {a.status === 'hired' && (
                a.converted ? (
                    <p className="mt-2 flex items-center gap-1 text-xs text-success">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Added to Employees
                    </p>
                ) : canHire ? (
                    <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => onConvert(a)}>
                        <UserPlus className="h-3.5 w-3.5" /> Add to Employees
                    </Button>
                ) : null
            )}
        </div>
    );
}

export function RecruitmentPipeline({ openingId }) {
    const { can } = useAuth();
    const qc = useQueryClient();
    const [converting, setConverting] = useState(null);
    const [dragged, setDragged] = useState(null);
    const [over, setOver] = useState(null);

    const canEdit = can('recruitment', 'edit');
    const canHire = can('employees', 'create');

    const { data, isLoading } = useQuery({
        queryKey: ['recruitment', 'pipeline', openingId],
        queryFn: async () => (await api.get('/recruitment/pipeline', {
            params: { opening_id: openingId || undefined },
        })).data,
    });

    const move = useMutation({
        mutationFn: ({ application, status }) =>
            api.post(`/recruitment/applications/${application.id}/status`, { status }),
        onSuccess: ({ data }, { application, status }) => {
            toast.success(`${application.name} moved to ${status}.`);
            qc.invalidateQueries({ queryKey: ['recruitment'] });
        },
        onError: (err) => toast.error(apiError(err)),
    });

    const stage = (application, status) => {
        if (status === application.status) return;
        move.mutate({ application, status });
    };

    const drop = (columnKey) => {
        setOver(null);
        if (dragged) stage(dragged, columnKey);
        setDragged(null);
    };

    const columns = data?.columns ?? [];

    if (isLoading) return <LoadingBlock />;

    if ((data?.total ?? 0) === 0) {
        return (
            <Card>
                <CardBody>
                    <EmptyState
                        icon={Users}
                        title="No applications yet"
                        message="Applications from the careers portal land here and move through the pipeline."
                    />
                </CardBody>
            </Card>
        );
    }

    return (
        <>
            {/* The board scrolls horizontally rather than squeezing seven columns onto a phone. */}
            <div className="overflow-x-auto pb-2">
                <div className="flex gap-3 min-w-max">
                    {columns.map((col) => (
                        <div
                            key={col.key}
                            onDragOver={(e) => { if (dragged) { e.preventDefault(); setOver(col.key); } }}
                            onDragLeave={() => setOver((o) => (o === col.key ? null : o))}
                            onDrop={(e) => { e.preventDefault(); drop(col.key); }}
                            className={cn(
                                'w-[16rem] shrink-0 rounded-xl border border-t-2 border-border bg-surface-2/50 p-2 transition-colors',
                                COLUMN_TONE[col.key],
                                over === col.key && 'bg-brand-soft'
                            )}
                        >
                            <div className="flex items-center justify-between px-1 pb-2">
                                <p className="text-sm font-medium capitalize">{col.label}</p>
                                <Badge tone="neutral">{col.applications.length}</Badge>
                            </div>

                            <div className="space-y-2">
                                {col.applications.map((a) => (
                                    <ApplicantCard
                                        key={a.id}
                                        application={a}
                                        statuses={columns}
                                        canEdit={canEdit}
                                        canHire={canHire}
                                        dragging={dragged?.id === a.id}
                                        onDragStart={setDragged}
                                        onDragEnd={() => { setDragged(null); setOver(null); }}
                                        onStage={stage}
                                        onConvert={setConverting}
                                    />
                                ))}

                                {col.applications.length === 0 && (
                                    <p className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted">
                                        {dragged ? 'Drop here' : 'Empty'}
                                    </p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {canEdit && (
                <p className="mt-2 text-xs text-muted">
                    Drag a card to move it through the pipeline, or use the stage dropdown on the card.
                </p>
            )}

            {converting && <ConvertForm application={converting} onClose={() => setConverting(null)} />}
        </>
    );
}
