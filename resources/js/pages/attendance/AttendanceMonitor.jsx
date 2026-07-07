import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, Clock, MapPin, RefreshCw } from 'lucide-react';
import api from '@/lib/api';
import { useBranches } from '@/hooks/useLookups';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { Select } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { StatCard } from '@/components/StatCard';
import { LoadingBlock, EmptyState } from '@/components/ui/States';
import { formatTime } from '@/lib/utils';

export default function AttendanceMonitor() {
    const { data: branches } = useBranches();
    const [branchId, setBranchId] = useState('');

    const { data, isLoading, refetch, isFetching } = useQuery({
        queryKey: ['attendance', 'monitor', branchId],
        queryFn: async () => (await api.get('/attendance/monitor', { params: { branch_id: branchId } })).data,
        refetchInterval: 30_000,
    });

    const present = data?.present ?? [];

    return (
        <>
            <PageHeader
                title="Who’s in"
                subtitle="Live board of who has clocked in today."
                actions={
                    <div className="flex items-center gap-2">
                        <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="w-44">
                            <option value="">All branches</option>
                            {branches?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </Select>
                        <Button variant="outline" size="icon" onClick={() => refetch()} aria-label="Refresh">
                            <RefreshCw className={isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
                        </Button>
                    </div>
                }
            />

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
                <StatCard label="Currently in" value={data?.present_count ?? '—'} icon={Users} tone="success" />
                <StatCard label="Punched today" value={data?.total_punched ?? '—'} icon={Clock} tone="brand" index={1} />
                <StatCard label="On the board" value={present.length} icon={MapPin} tone="amber" index={2} />
            </div>

            <Card>
                <CardBody>
                    {isLoading ? (
                        <LoadingBlock label="Loading the board…" />
                    ) : present.length === 0 ? (
                        <EmptyState icon={Users} title="Nobody clocked in yet" message="As employees punch in, their photo and location appear here." />
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {present.map((a) => {
                                const last = a.punches[a.punches.length - 1];
                                const coord = last?.in_coord?.split('|');
                                return (
                                    <div key={a.id} className="flex gap-3 rounded-xl border border-border p-3">
                                        {last?.in_photo ? (
                                            <img src={last.in_photo} alt={a.employee?.name} className="h-14 w-14 rounded-lg object-cover" />
                                        ) : (
                                            <Avatar name={a.employee?.name} src={a.employee?.photo_url} size="lg" className="rounded-lg" />
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate font-medium">{a.employee?.name}</p>
                                            <p className="truncate text-xs text-muted">{a.employee?.position ?? '—'}</p>
                                            <p className="mt-1 flex items-center gap-1 text-xs text-success">
                                                <Clock className="h-3 w-3" /> In since {formatTime(a.punches[0]?.in)}
                                            </p>
                                            {coord && (
                                                <a
                                                    href={`https://maps.google.com/?q=${coord[0]},${coord[1]}`}
                                                    target="_blank" rel="noreferrer"
                                                    className="mt-0.5 flex items-center gap-1 font-mono text-[11px] text-muted hover:text-brand"
                                                >
                                                    <MapPin className="h-3 w-3" /> {Number(coord[0]).toFixed(4)}, {Number(coord[1]).toFixed(4)}
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardBody>
            </Card>
        </>
    );
}
