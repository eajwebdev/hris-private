import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
    addMonths, format, isSameMonth, isToday, parseISO, isWithinInterval,
} from 'date-fns';
import { ChevronLeft, ChevronRight, AlertTriangle, CalendarClock } from 'lucide-react';
import api from '@/lib/api';
import { useBranches } from '@/hooks/useLookups';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Field';
import { LoadingBlock, EmptyState } from '@/components/ui/States';
import { cn } from '@/lib/utils';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Team/branch leave calendar. A day is flagged when enough people from one
 * department are off that cover gets thin — the threshold comes from the server.
 */
export function LeaveCalendar() {
    const [cursor, setCursor] = useState(new Date());
    const [branchId, setBranchId] = useState('');
    const { data: branches } = useBranches();

    const gridStart = startOfWeek(startOfMonth(cursor));
    const gridEnd = endOfWeek(endOfMonth(cursor));

    const { data, isLoading } = useQuery({
        queryKey: ['leave', 'calendar', format(gridStart, 'yyyy-MM-dd'), format(gridEnd, 'yyyy-MM-dd'), branchId],
        queryFn: async () => (await api.get('/leave/calendar', {
            params: {
                from: format(gridStart, 'yyyy-MM-dd'),
                to: format(gridEnd, 'yyyy-MM-dd'),
                branch_id: branchId || undefined,
            },
        })).data,
    });

    const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

    // Index the per-day coverage rows so each cell is a lookup, not a scan.
    const coverage = useMemo(() => {
        const map = {};
        for (const d of data?.days ?? []) map[d.date] = d;
        return map;
    }, [data]);

    const entriesOn = (day) =>
        (data?.entries ?? []).filter((e) =>
            isWithinInterval(day, { start: parseISO(e.date_from), end: parseISO(e.date_to) })
        );

    return (
        <Card>
            <CardBody className="p-0">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" onClick={() => setCursor(addMonths(cursor, -1))} aria-label="Previous month">
                            <ChevronLeft className="h-5 w-5" />
                        </Button>
                        <p className="font-display text-lg font-semibold min-w-[9rem] text-center">{format(cursor, 'MMMM yyyy')}</p>
                        <Button variant="ghost" size="icon" onClick={() => setCursor(addMonths(cursor, 1))} aria-label="Next month">
                            <ChevronRight className="h-5 w-5" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>Today</Button>
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1.5 text-xs text-muted">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber" />
                            {data?.threshold ?? 2}+ off in one department
                        </span>
                        <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="w-40">
                            <option value="">All branches</option>
                            {(branches ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </Select>
                    </div>
                </div>

                {isLoading ? (
                    <LoadingBlock />
                ) : (data?.entries ?? []).length === 0 ? (
                    <EmptyState icon={CalendarClock} title="Nobody is off this month"
                        message="Approved and pending leave will appear here so you can spot coverage gaps." />
                ) : (
                    <div className="p-4">
                        <div className="grid grid-cols-7 gap-px">
                            {WEEKDAYS.map((d) => (
                                <div key={d} className="pb-2 text-center text-xs font-medium text-muted">{d}</div>
                            ))}

                            {days.map((day) => {
                                const key = format(day, 'yyyy-MM-dd');
                                const onLeave = entriesOn(day);
                                const cov = coverage[key];
                                const thin = cov?.departments?.some((d) => d.thin);
                                const outside = !isSameMonth(day, cursor);

                                return (
                                    <div
                                        key={key}
                                        className={cn(
                                            'min-h-[92px] border border-border p-1.5 transition-colors',
                                            outside && 'opacity-40',
                                            thin && 'bg-amber/10'
                                        )}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className={cn(
                                                'text-xs tabular',
                                                isToday(day) ? 'flex h-5 w-5 items-center justify-center rounded-full bg-brand text-white' : 'text-muted'
                                            )}>
                                                {format(day, 'd')}
                                            </span>
                                            {thin && (
                                                <span title={cov.departments.filter((d) => d.thin).map((d) => `${d.name}: ${d.count} off`).join(', ')}>
                                                    <AlertTriangle className="h-3.5 w-3.5 text-amber" />
                                                </span>
                                            )}
                                        </div>

                                        <div className="mt-1 space-y-0.5">
                                            {onLeave.slice(0, 3).map((e) => (
                                                <div
                                                    key={e.id}
                                                    title={`${e.employee} · ${e.type}${e.status === 'pending' ? ' (pending)' : ''}`}
                                                    className={cn(
                                                        'truncate rounded px-1 py-0.5 text-[10px] text-white',
                                                        e.status === 'pending' && 'opacity-60'
                                                    )}
                                                    style={{ backgroundColor: e.color }}
                                                >
                                                    {e.employee?.split(' ')[0]}
                                                    {e.half_day && ' ½'}
                                                </div>
                                            ))}
                                            {onLeave.length > 3 && (
                                                <p className="px-1 text-[10px] text-muted">+{onLeave.length - 3} more</p>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <p className="mt-3 text-xs text-muted">
                            Faded entries are still pending approval. Shaded days are where a department has{' '}
                            {data?.threshold ?? 2} or more people off.
                        </p>
                    </div>
                )}
            </CardBody>
        </Card>
    );
}
