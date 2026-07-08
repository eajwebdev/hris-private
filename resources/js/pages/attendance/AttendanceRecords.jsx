import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { CalendarClock } from 'lucide-react';
import api from '@/lib/api';
import { useBranches } from '@/hooks/useLookups';
import { useServerPagination } from '@/hooks/usePagination';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Field';
import { DateRangePicker } from '@/components/ui/DateRangePicker';
import { Badge } from '@/components/ui/Badge';
import { Table, THead, TH, TBody, TR, TD } from '@/components/ui/Table';
import { Pagination } from '@/components/ui/Pagination';
import { LoadingBlock, EmptyState } from '@/components/ui/States';
import { formatDate, formatTime, pageMeta } from '@/lib/utils';

const PER_PAGE = 15;

export default function AttendanceRecords() {
    const { data: branches } = useBranches();
    const [branchId, setBranchId] = useState('');
    const [range, setRange] = useState({ from: '', to: '' });
    const { page, setPage } = useServerPagination(`${branchId}|${range.from}|${range.to}`);

    const { data, isLoading } = useQuery({
        queryKey: ['attendance', 'records', { branchId, range, page }],
        queryFn: async () => (await api.get('/attendance', { params: { branch_id: branchId, from: range.from || undefined, to: range.to || undefined, per_page: PER_PAGE, page } })).data,
        placeholderData: keepPreviousData,
    });

    const rows = data?.data ?? [];
    const meta = pageMeta(data, PER_PAGE);

    return (
        <>
            <Card className="mb-4 p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="sm:w-48">
                        <option value="">All branches</option>
                        {branches?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </Select>
                    <DateRangePicker value={range} onChange={setRange} maxDate={new Date()} className="sm:w-72" placeholder="All dates" />
                </div>
            </Card>

            <Card>
                {isLoading ? (
                    <LoadingBlock />
                ) : rows.length === 0 ? (
                    <EmptyState icon={CalendarClock} title="No records" message="Attendance rows will appear here as employees clock in and out." />
                ) : (
                    <>
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
                    <Pagination page={meta.page} lastPage={meta.lastPage} total={meta.total} perPage={meta.perPage} onPage={setPage} />
                    </>
                )}
            </Card>
        </>
    );
}
