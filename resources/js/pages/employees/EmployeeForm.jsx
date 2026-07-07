import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import api, { apiError } from '@/lib/api';
import { useBranches, useDepartments, usePositions, useManagers } from '@/hooks/useLookups';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';

const EMPTY = {
    branch_id: '', department_id: '', position_id: '', manager_id: '', employee_no: '',
    first_name: '', middle_name: '', last_name: '', email: '', phone: '', birth_date: '',
    gender: '', civil_status: '', address: '', employment_type: 'full_time', status: 'probationary',
    date_hired: '', basic_salary: '', tin: '', sss: '', philhealth: '', pagibig: '',
    bank_name: '', bank_account: '',
};

function Section({ title, children }) {
    return (
        <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
        </div>
    );
}

export function EmployeeForm({ open, onClose, employee, onSaved }) {
    const [form, setForm] = useState(EMPTY);
    const [photo, setPhoto] = useState(null);
    const [errors, setErrors] = useState({});
    const isEdit = !!employee;

    const { data: branches } = useBranches();
    const { data: departments } = useDepartments(form.branch_id || undefined);
    const { data: positions } = usePositions(form.branch_id || undefined, form.department_id || undefined);
    const { data: managers } = useManagers(form.branch_id || undefined);

    useEffect(() => {
        if (open) {
            setForm(employee ? { ...EMPTY, ...normalize(employee) } : EMPTY);
            setPhoto(null);
            setErrors({});
        }
    }, [open, employee]);

    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    const saveMut = useMutation({
        mutationFn: async () => {
            const fd = new FormData();
            Object.entries(form).forEach(([k, v]) => v !== '' && v != null && fd.append(k, v));
            if (photo) fd.append('photo', photo);
            const url = isEdit ? `/employees/${employee.id}` : '/employees';
            return api.post(url, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        },
        onSuccess: () => {
            toast.success(isEdit ? 'Employee updated.' : 'Employee added.');
            onSaved?.();
        },
        onError: (e) => {
            setErrors(e.response?.data?.errors ?? {});
            toast.error(apiError(e));
        },
    });

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={isEdit ? 'Edit employee' : 'Add employee'}
            description="Fill in the 201 details. Only name and branch are required to start."
            size="xl"
            footer={
                <>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={() => saveMut.mutate()} loading={saveMut.isPending}>
                        {isEdit ? 'Save changes' : 'Add employee'}
                    </Button>
                </>
            }
        >
            <div className="space-y-6">
                <Section title="Personal">
                    <Field label="First name" error={errors.first_name?.[0]}>
                        <Input value={form.first_name} onChange={set('first_name')} />
                    </Field>
                    <Field label="Last name" error={errors.last_name?.[0]}>
                        <Input value={form.last_name} onChange={set('last_name')} />
                    </Field>
                    <Field label="Middle name">
                        <Input value={form.middle_name} onChange={set('middle_name')} />
                    </Field>
                    <Field label="Employee no.">
                        <Input value={form.employee_no} onChange={set('employee_no')} placeholder="Auto if blank" />
                    </Field>
                    <Field label="Email" error={errors.email?.[0]}>
                        <Input type="email" value={form.email} onChange={set('email')} />
                    </Field>
                    <Field label="Phone">
                        <Input value={form.phone} onChange={set('phone')} />
                    </Field>
                    <Field label="Birth date">
                        <Input type="date" value={form.birth_date} onChange={set('birth_date')} />
                    </Field>
                    <Field label="Gender">
                        <Select value={form.gender} onChange={set('gender')}>
                            <option value="">—</option>
                            <option value="male">Male</option>
                            <option value="female">Female</option>
                            <option value="other">Other</option>
                        </Select>
                    </Field>
                    <Field label="Civil status">
                        <Input value={form.civil_status} onChange={set('civil_status')} />
                    </Field>
                    <Field label="Photo">
                        <Input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} className="pt-2 text-muted" />
                    </Field>
                    <Field label="Address" className="sm:col-span-2">
                        <Input value={form.address} onChange={set('address')} />
                    </Field>
                </Section>

                <Section title="Employment">
                    <Field label="Branch" error={errors.branch_id?.[0]}>
                        <Select value={form.branch_id} onChange={(e) => setForm((f) => ({ ...f, branch_id: e.target.value, department_id: '', position_id: '' }))}>
                            <option value="">Select branch…</option>
                            {branches?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </Select>
                    </Field>
                    <Field label="Department">
                        <Select value={form.department_id} onChange={(e) => setForm((f) => ({ ...f, department_id: e.target.value, position_id: '' }))} disabled={!form.branch_id}>
                            <option value="">—</option>
                            {departments?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </Select>
                    </Field>
                    <Field label="Position">
                        <Select value={form.position_id} onChange={set('position_id')} disabled={!form.branch_id}>
                            <option value="">—</option>
                            {positions?.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                        </Select>
                    </Field>
                    <Field label="Reports to">
                        <Select value={form.manager_id} onChange={set('manager_id')} disabled={!form.branch_id}>
                            <option value="">—</option>
                            {managers?.filter((m) => m.id !== employee?.id).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </Select>
                    </Field>
                    <Field label="Employment type">
                        <Select value={form.employment_type} onChange={set('employment_type')}>
                            <option value="full_time">Full-time</option>
                            <option value="part_time">Part-time</option>
                            <option value="contract">Contract</option>
                        </Select>
                    </Field>
                    <Field label="Status">
                        <Select value={form.status} onChange={set('status')}>
                            {['probationary', 'regular', 'resigned', 'terminated'].map((s) => (
                                <option key={s} value={s} className="capitalize">{s}</option>
                            ))}
                        </Select>
                    </Field>
                    <Field label="Date hired">
                        <Input type="date" value={form.date_hired} onChange={set('date_hired')} />
                    </Field>
                    <Field label="Basic salary (₱)">
                        <Input type="number" value={form.basic_salary} onChange={set('basic_salary')} className="font-mono" />
                    </Field>
                </Section>

                <Section title="Government & bank">
                    <Field label="TIN"><Input value={form.tin} onChange={set('tin')} className="font-mono" /></Field>
                    <Field label="SSS"><Input value={form.sss} onChange={set('sss')} className="font-mono" /></Field>
                    <Field label="PhilHealth"><Input value={form.philhealth} onChange={set('philhealth')} className="font-mono" /></Field>
                    <Field label="Pag-IBIG"><Input value={form.pagibig} onChange={set('pagibig')} className="font-mono" /></Field>
                    <Field label="Bank"><Input value={form.bank_name} onChange={set('bank_name')} /></Field>
                    <Field label="Bank account"><Input value={form.bank_account} onChange={set('bank_account')} className="font-mono" /></Field>
                </Section>
            </div>
        </Modal>
    );
}

function normalize(e) {
    return {
        branch_id: e.branch_id ?? '', department_id: e.department_id ?? '', position_id: e.position_id ?? '',
        manager_id: e.manager_id ?? '', employee_no: e.employee_no ?? '', first_name: e.first_name ?? '',
        middle_name: e.middle_name ?? '', last_name: e.last_name ?? '', email: e.email ?? '', phone: e.phone ?? '',
        birth_date: e.birth_date ?? '', gender: e.gender ?? '', civil_status: e.civil_status ?? '', address: e.address ?? '',
        employment_type: e.employment_type ?? 'full_time', status: e.status ?? 'probationary',
        date_hired: e.date_hired ?? '', basic_salary: e.basic_salary ?? '', tin: e.tin ?? '', sss: e.sss ?? '',
        philhealth: e.philhealth ?? '', pagibig: e.pagibig ?? '', bank_name: e.bank_name ?? '', bank_account: e.bank_account ?? '',
    };
}
