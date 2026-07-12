import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, SlidersHorizontal, Lock, PlusCircle, MinusCircle, Users } from 'lucide-react';
import api, { apiError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useBranches, useEmployeesLookup } from '@/hooks/useLookups';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Badge } from '@/components/ui/Badge';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { Field, Input, Select } from '@/components/ui/Field';
import { Table, THead, TH, TBody, TR, TD } from '@/components/ui/Table';
import { LoadingBlock, EmptyState } from '@/components/ui/States';
import { peso } from '@/lib/utils';

const emptyForm = (type) => ({
    code: '', name: '', type, calc: 'fixed', amount: '',
    branch_id: '', is_active: true, applies_to_all: true, is_statutory: false, is_taxable: true,
});

/** Show the amount the way it will be applied: a peso figure or a percentage. */
const amountLabel = (c) => (c.calc === 'fixed' ? peso(c.amount) : `${c.amount}%`);

function ComponentForm({ open, component, defaultType, onClose, meta }) {
    const qc = useQueryClient();
    const { data: branches } = useBranches();
    const editing = !!component;

    const [form, setForm] = useState(() =>
        component
            ? {
                  code: component.code,
                  name: component.name,
                  type: component.type,
                  calc: component.calc,
                  amount: String(component.amount),
                  branch_id: component.branch_id ?? '',
                  is_active: component.is_active,
                  applies_to_all: component.applies_to_all,
                  is_statutory: component.is_statutory,
                  is_taxable: component.is_taxable,
              }
            : emptyForm(defaultType)
    );

    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
    const toggle = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.checked }));

    // Auto-suggest a code from the name, but only while creating.
    const onName = (e) => {
        const name = e.target.value;
        setForm((f) => ({
            ...f,
            name,
            code: editing ? f.code : name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30),
        }));
    };

    const save = useMutation({
        mutationFn: () => {
            const payload = {
                ...form,
                amount: Number(form.amount) || 0,
                branch_id: form.branch_id || null,
            };
            return editing
                ? api.put(`/payroll/components/${component.id}`, payload)
                : api.post('/payroll/components', payload);
        },
        onSuccess: ({ data }) => {
            toast.success(data.message);
            qc.invalidateQueries({ queryKey: ['payroll'] });
            onClose();
        },
        onError: (err) => toast.error(apiError(err)),
    });

    const isPercent = form.calc !== 'fixed';
    const valid = form.name.trim() && form.code.trim() && form.amount !== '';

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={editing ? `Edit ${component.name}` : `New ${form.type}`}
            description={
                form.type === 'earning'
                    ? 'An allowance or bonus added on top of basic pay.'
                    : 'An amount withheld from pay — a contribution, loan, or any deduction you define.'
            }
            footer={
                <div className="flex w-full justify-end gap-2">
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!valid}>
                        {editing ? 'Save' : 'Add component'}
                    </Button>
                </div>
            }
        >
            <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Name">
                        <Input value={form.name} onChange={onName} placeholder="e.g. Rice Allowance" />
                    </Field>
                    <Field label="Code" hint="Used on the payslip; must be unique.">
                        <Input value={form.code} onChange={set('code')} placeholder="rice_allowance" />
                    </Field>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Type">
                        <Select value={form.type} onChange={set('type')}>
                            {(meta?.types ?? []).map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </Select>
                    </Field>
                    <Field label="How it's calculated">
                        <Select value={form.calc} onChange={set('calc')}>
                            {(meta?.calcs ?? []).map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </Select>
                    </Field>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label={isPercent ? 'Percentage' : 'Amount'} hint={isPercent ? 'e.g. 4.5 for 4.5%' : 'In pesos'}>
                        <Input
                            type="number" step={isPercent ? '0.01' : '0.01'} min="0"
                            value={form.amount} onChange={set('amount')}
                            placeholder={isPercent ? '4.5' : '2000'}
                        />
                    </Field>
                    <Field label="Branch" hint="Leave blank to apply company-wide.">
                        <Select value={form.branch_id} onChange={set('branch_id')}>
                            <option value="">All branches</option>
                            {(branches ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </Select>
                    </Field>
                </div>

                <div className="space-y-2 rounded-xl border border-border p-3">
                    <label className="flex items-start gap-2.5 text-sm">
                        <input type="checkbox" className="mt-0.5" checked={form.applies_to_all} onChange={toggle('applies_to_all')} />
                        <span>
                            Apply to every employee
                            <span className="block text-xs text-muted">
                                Turn this off to assign it to specific employees instead.
                            </span>
                        </span>
                    </label>
                    <label className="flex items-center gap-2.5 text-sm">
                        <input type="checkbox" checked={form.is_active} onChange={toggle('is_active')} />
                        <span>Active — include in new payroll runs</span>
                    </label>
                </div>
            </div>
        </Modal>
    );
}

/** Per-employee assignment: which components apply, and at what amount. */
function AssignForm({ open, onClose }) {
    const qc = useQueryClient();
    const { data: employees } = useEmployeesLookup();
    const [employeeId, setEmployeeId] = useState('');
    const [rows, setRows] = useState([]);

    const { data, isLoading } = useQuery({
        queryKey: ['payroll', 'employee-components', employeeId],
        queryFn: async () => {
            const res = (await api.get(`/payroll/employees/${employeeId}/components`)).data;
            setRows(res.data.map((c) => ({
                payroll_component_id: c.id,
                applies: c.applies,
                override: c.override_amount ?? '',
                component: c,
            })));
            return res;
        },
        enabled: !!employeeId,
    });

    const save = useMutation({
        mutationFn: () => api.post(`/payroll/employees/${employeeId}/components`, {
            components: rows
                // Only send rows that differ from the component's own default.
                .filter((r) => r.applies !== r.component.applies_to_all || r.override !== '')
                .map((r) => ({
                    payroll_component_id: r.payroll_component_id,
                    is_active: r.applies,
                    amount: r.override === '' ? null : Number(r.override),
                })),
        }),
        onSuccess: ({ data }) => {
            toast.success(data.message);
            qc.invalidateQueries({ queryKey: ['payroll'] });
            onClose();
        },
        onError: (err) => toast.error(apiError(err)),
    });

    const setRow = (id, patch) =>
        setRows((rs) => rs.map((r) => (r.payroll_component_id === id ? { ...r, ...patch } : r)));

    return (
        <Modal
            open={open}
            onClose={onClose}
            size="lg"
            title="Assign components to an employee"
            description="Override an amount, or switch a component on or off for this person only."
            footer={
                <div className="flex w-full justify-end gap-2">
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!employeeId || isLoading}>
                        Save assignment
                    </Button>
                </div>
            }
        >
            <div className="space-y-4">
                <Field label="Employee">
                    <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                        <option value="">Select employee…</option>
                        {(employees ?? []).map((e) => (
                            <option key={e.id} value={e.id}>{e.name}{e.employee_no ? ` · ${e.employee_no}` : ''}</option>
                        ))}
                    </Select>
                </Field>

                {!employeeId ? (
                    <p className="py-6 text-center text-sm text-muted">Pick an employee to see their components.</p>
                ) : isLoading ? (
                    <LoadingBlock />
                ) : (
                    <>
                        <p className="text-xs text-muted">
                            Monthly basic: <span className="tabular font-medium">{peso(data?.employee?.basic_salary ?? 0)}</span>
                        </p>
                        <div className="space-y-2">
                            {rows.map((r) => (
                                <div key={r.payroll_component_id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3">
                                    <label className="flex flex-1 items-center gap-2.5 min-w-0">
                                        <input
                                            type="checkbox"
                                            checked={r.applies}
                                            onChange={(e) => setRow(r.payroll_component_id, { applies: e.target.checked })}
                                        />
                                        <span className="min-w-0">
                                            <span className="flex items-center gap-1.5 font-medium">
                                                {r.component.type === 'earning'
                                                    ? <PlusCircle className="h-3.5 w-3.5 text-success" />
                                                    : <MinusCircle className="h-3.5 w-3.5 text-danger" />}
                                                {r.component.name}
                                            </span>
                                            <span className="block text-xs text-muted">
                                                Default {amountLabel(r.component)} · {r.component.calc_label}
                                            </span>
                                        </span>
                                    </label>

                                    <Input
                                        type="number" min="0" step="0.01"
                                        className="w-32 text-right"
                                        placeholder="Default"
                                        disabled={!r.applies}
                                        value={r.override}
                                        onChange={(e) => setRow(r.payroll_component_id, { override: e.target.value })}
                                        aria-label={`Override amount for ${r.component.name}`}
                                    />
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </Modal>
    );
}

export function PayrollComponents() {
    const { can } = useAuth();
    const qc = useQueryClient();
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [defaultType, setDefaultType] = useState('earning');
    const [deleting, setDeleting] = useState(null);
    const [assignOpen, setAssignOpen] = useState(false);

    const { data, isLoading } = useQuery({
        queryKey: ['payroll', 'components'],
        queryFn: async () => (await api.get('/payroll/components')).data,
    });

    const components = data?.data ?? [];
    const earnings = components.filter((c) => c.type === 'earning');
    const deductions = components.filter((c) => c.type === 'deduction');

    const del = useMutation({
        mutationFn: (id) => api.delete(`/payroll/components/${id}`),
        onSuccess: ({ data }) => {
            toast.success(data.message);
            qc.invalidateQueries({ queryKey: ['payroll'] });
            setDeleting(null);
        },
        onError: (err) => { toast.error(apiError(err)); setDeleting(null); },
    });

    const openNew = (type) => { setDefaultType(type); setEditing(null); setFormOpen(true); };

    const Group = ({ title, icon: Icon, rows, type, tone }) => (
        <Card>
            <CardBody className="p-0">
                <div className="flex items-center justify-between gap-2 border-b border-border p-4">
                    <h3 className={`flex items-center gap-2 font-display font-semibold ${tone}`}>
                        <Icon className="h-4 w-4" /> {title}
                    </h3>
                    {can('payroll', 'create') && (
                        <Button variant="outline" size="sm" onClick={() => openNew(type)}>
                            <Plus className="h-3.5 w-3.5" /> Add
                        </Button>
                    )}
                </div>

                {rows.length === 0 ? (
                    <EmptyState
                        icon={SlidersHorizontal}
                        title={`No ${title.toLowerCase()} yet`}
                        message={`Add a column and it will appear on every payslip generated from now on.`}
                    />
                ) : (
                    <Table>
                        <THead>
                            <TH>Component</TH>
                            <TH className="text-right">Amount</TH>
                            <TH className="hidden md:table-cell">Applies to</TH>
                            <TH className="text-right">Actions</TH>
                        </THead>
                        <TBody>
                            {rows.map((c) => (
                                <TR key={c.id}>
                                    <TD>
                                        <div className="flex items-center gap-2">
                                            <div className="min-w-0">
                                                <p className="flex items-center gap-1.5 truncate font-medium">
                                                    {c.name}
                                                    {c.is_statutory && (
                                                        <span title="Statutory contribution">
                                                            <Lock className="h-3 w-3 text-muted" />
                                                        </span>
                                                    )}
                                                </p>
                                                <p className="truncate text-xs text-muted">{c.calc_label}</p>
                                            </div>
                                            {!c.is_active && <Badge tone="neutral">Inactive</Badge>}
                                        </div>
                                    </TD>
                                    <TD className="text-right tabular font-medium">{amountLabel(c)}</TD>
                                    <TD className="hidden md:table-cell text-muted">
                                        {c.applies_to_all ? 'Everyone' : 'Assigned employees'}
                                        {c.branch && ` · ${c.branch}`}
                                    </TD>
                                    <TD>
                                        <div className="flex items-center justify-end gap-0.5">
                                            {can('payroll', 'edit') && (
                                                <IconButton label="Edit" icon={Pencil}
                                                    onClick={() => { setEditing(c); setFormOpen(true); }} />
                                            )}
                                            {can('payroll', 'delete') && (
                                                <IconButton label="Delete" icon={Trash2} tone="danger" onClick={() => setDeleting(c)} />
                                            )}
                                        </div>
                                    </TD>
                                </TR>
                            ))}
                        </TBody>
                    </Table>
                )}
            </CardBody>
        </Card>
    );

    if (isLoading) return <LoadingBlock />;

    return (
        <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted">
                    Earnings are added on top of basic pay; deductions are withheld. Changes apply to the next payroll run —
                    payslips already generated keep the amounts they were computed with.
                </p>
                {can('payroll', 'edit') && (
                    <Button variant="outline" onClick={() => setAssignOpen(true)}>
                        <Users className="h-4 w-4" /> Assign to employee
                    </Button>
                )}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <Group title="Earnings" icon={PlusCircle} rows={earnings} type="earning" tone="text-success" />
                <Group title="Deductions" icon={MinusCircle} rows={deductions} type="deduction" tone="text-danger" />
            </div>

            {formOpen && (
                <ComponentForm
                    open={formOpen}
                    component={editing}
                    defaultType={defaultType}
                    meta={data}
                    onClose={() => { setFormOpen(false); setEditing(null); }}
                />
            )}

            {assignOpen && <AssignForm open={assignOpen} onClose={() => setAssignOpen(false)} />}

            <ConfirmDialog
                open={!!deleting}
                onClose={() => setDeleting(null)}
                onConfirm={() => del.mutate(deleting.id)}
                loading={del.isPending}
                title={`Delete ${deleting?.name}?`}
                message="It won't be included in future payroll runs. Payslips already generated keep the amount they were computed with."
                confirmLabel="Delete"
            />
        </>
    );
}
