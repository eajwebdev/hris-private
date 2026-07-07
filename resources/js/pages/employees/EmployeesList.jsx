import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Eye, Pencil, Trash2, Users, Network } from 'lucide-react';
import { toast } from 'sonner';
import api, { apiError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useBranches } from '@/hooks/useLookups';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, statusTone } from '@/components/ui/Badge';
import { Table, THead, TH, TBody, TR, TD } from '@/components/ui/Table';
import { IconButton } from '@/components/ui/IconButton';
import { LoadingBlock, EmptyState, ErrorState } from '@/components/ui/States';
import { ConfirmDialog } from '@/components/ui/Modal';
import { EmployeeForm } from './EmployeeForm';

export default function EmployeesList() {
    const { can } = useAuth();
    const navigate = useNavigate();
    const qc = useQueryClient();
    const { data: branches } = useBranches();

    const [search, setSearch] = useState('');
    const [branchId, setBranchId] = useState('');
    const [status, setStatus] = useState('');
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [deleting, setDeleting] = useState(null);

    const { data, isLoading, isError, refetch } = useQuery({
        queryKey: ['employees', { search, branchId, status }],
        queryFn: async () =>
            (await api.get('/employees', { params: { search, branch_id: branchId, status, per_page: 50 } })).data,
    });

    const removeMut = useMutation({
        mutationFn: (id) => api.delete(`/employees/${id}`),
        onSuccess: () => {
            toast.success('Employee archived.');
            qc.invalidateQueries({ queryKey: ['employees'] });
            setDeleting(null);
        },
        onError: (e) => toast.error(apiError(e)),
    });

    const rows = data?.data ?? [];

    return (
        <>
            <PageHeader
                title="Employees"
                subtitle="The company 201 file across your branches."
                actions={
                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={() => navigate('/app/employees/org-chart')}>
                            <Network className="h-4 w-4" /> Org chart
                        </Button>
                        {can('employees', 'create') && (
                            <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
                                <Plus className="h-4 w-4" /> Add employee
                            </Button>
                        )}
                    </div>
                }
            />

            <Card className="mb-4 p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, number, email…" className="pl-9" />
                    </div>
                    <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="sm:w-48">
                        <option value="">All branches</option>
                        {branches?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </Select>
                    <Select value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-44">
                        <option value="">All statuses</option>
                        {['probationary', 'regular', 'resigned', 'terminated'].map((s) => (
                            <option key={s} value={s} className="capitalize">{s}</option>
                        ))}
                    </Select>
                </div>
            </Card>

            <Card>
                {isLoading ? (
                    <LoadingBlock label="Loading employees…" />
                ) : isError ? (
                    <ErrorState onRetry={refetch} />
                ) : rows.length === 0 ? (
                    <EmptyState
                        icon={Users}
                        title="No employees yet"
                        message="Add your first employee to start building the 201 file."
                        action={can('employees', 'create') && <Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" /> Add employee</Button>}
                    />
                ) : (
                    <Table>
                        <THead>
                            <TH>Employee</TH>
                            <TH className="hidden md:table-cell">Position</TH>
                            <TH className="hidden lg:table-cell">Branch</TH>
                            <TH>Status</TH>
                            <TH className="text-right">Actions</TH>
                        </THead>
                        <TBody>
                            {rows.map((e) => (
                                <TR key={e.id} className="cursor-pointer" onClick={() => navigate(`/app/employees/${e.id}`)}>
                                    <TD>
                                        <div className="flex items-center gap-3">
                                            <Avatar name={e.full_name} src={e.photo_url} size="sm" />
                                            <div>
                                                <p className="font-medium">{e.full_name}</p>
                                                <p className="text-xs text-muted font-mono">{e.employee_no || '—'}</p>
                                            </div>
                                        </div>
                                    </TD>
                                    <TD className="hidden md:table-cell text-muted">{e.position?.title ?? '—'}</TD>
                                    <TD className="hidden lg:table-cell text-muted">{e.branch?.name ?? '—'}</TD>
                                    <TD><Badge tone={statusTone(e.status)} className="capitalize">{e.status}</Badge></TD>
                                    <TD onClick={(ev) => ev.stopPropagation()}>
                                        <div className="flex items-center justify-end gap-0.5">
                                            <IconButton label="View" icon={Eye} onClick={() => navigate(`/app/employees/${e.id}`)} />
                                            {can('employees', 'edit') && (
                                                <IconButton label="Edit" icon={Pencil} onClick={() => { setEditing(e); setFormOpen(true); }} />
                                            )}
                                            {can('employees', 'delete') && (
                                                <IconButton label="Archive" icon={Trash2} onClick={() => setDeleting(e)} />
                                            )}
                                        </div>
                                    </TD>
                                </TR>
                            ))}
                        </TBody>
                    </Table>
                )}
            </Card>

            <EmployeeForm
                open={formOpen}
                onClose={() => setFormOpen(false)}
                employee={editing}
                onSaved={() => { setFormOpen(false); qc.invalidateQueries({ queryKey: ['employees'] }); }}
            />

            <ConfirmDialog
                open={!!deleting}
                onClose={() => setDeleting(null)}
                onConfirm={() => removeMut.mutate(deleting.id)}
                loading={removeMut.isPending}
                title="Archive employee?"
                message={`${deleting?.full_name} will be archived (soft-deleted). You can restore them later from the database.`}
                confirmLabel="Archive"
            />
        </>
    );
}
