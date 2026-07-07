import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock } from 'lucide-react';
import api from '@/lib/api';
import { useBranches } from '@/hooks/useLookups';
import { Card } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { Table, THead, TH, TBody, TR, TD } from '@/components/ui/Table';
import { LoadingBlock, EmptyState } from '@/components/ui/States';
import { formatDate, formatTime } from '@/lib/utils';

export default function AttendanceRecords() {
    const { data: branches } = useBranches();
    const [branchId, setBranchId] = useState('');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');

    const { data, isLoading } = useQuery({
        queryKey: ['attendance', 'records', { branchId, from, to }],
        queryFn: async () => (await api.get('/attendance', { params: { branch_id: branchId, from, to, per_page: 50 } })).data,
    });

    const rows = data?.data ?? [];

    return (
        <>
            <Card className="mb-4 p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="sm:w-48">
                        <option value="">All branches</option>
                        {branches?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </Select>
                    <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="sm:w-44" />
                    <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="sm:w-44" />
                </div>
            </Card>

            <Card>
                {isLoading ? (
                    <LoadingBlock />
                ) : rows.length === 0 ? (
                    <EmptyState icon={CalendarClock} title="No records" message="Attendance rows will appear here as employees clock in and out." />
                ) : (
                    <Table>
                        <THead>
                            <TH>Employee</TH>
                            <TH>Date</TH>
                            <TH>Punches</TH>
                            <TH>Worked</TH>
                            <TH>Flags</TH>
                        </THead>
                        <TBody>
                            {rows.map((a) => (
                                <TR key={a.id}>
                                    <TD className="font-medium">{a.employee?.name}</TD>
                                    <TD className="text-muted">{formatDate(a.work_date)}</TD>
                                    <TD>
                                        <div className="flex flex-wrap gap-1 font-mono text-xs">
                                            {a.punches.map((p, i) => (
                                                <span key={i} className="rounded bg-surface-2 px-1.5 py-0.5">
                                                    {formatTime(p.in)}–{p.out ? formatTime(p.out) : '·'}
                                                </span>
                                            ))}
                                        </div>
                                    </TD>
                                    <TD className="font-mono">{a.worked_hours}h</TD>
                                    <TD>
                                        <div className="flex flex-wrap gap-1">
                                            {a.late_am_minutes > 0 && <Badge tone="danger">Late AM {a.late_am_minutes}m</Badge>}
                                            {a.late_pm_minutes > 0 && <Badge tone="danger">Late PM {a.late_pm_minutes}m</Badge>}
                                            {a.early_out_minutes > 0 && <Badge tone="amber">Early {a.early_out_minutes}m</Badge>}
                                            {a.undertime_minutes > 0 && <Badge tone="amber">UT {a.undertime_minutes}m</Badge>}
                                            {a.is_incomplete && <Badge tone="danger">Incomplete</Badge>}
                                            {!a.late_am_minutes && !a.late_pm_minutes && !a.early_out_minutes && !a.undertime_minutes && !a.is_incomplete && (
                                                <Badge tone="success">On time</Badge>
                                            )}
                                        </div>
                                    </TD>
                                </TR>
                            ))}
                        </TBody>
                    </Table>
                )}
            </Card>
        </>
    );
}
