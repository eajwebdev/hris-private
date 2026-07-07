import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import {
    Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip as RTooltip, BarChart, Bar, CartesianGrid,
} from 'recharts';
import { Users, UserCheck, CalendarClock, Clock, Briefcase, ClipboardCheck, CalendarDays, MapPin } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { LoadingBlock, EmptyState } from '@/components/ui/States';

export default function Dashboard() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { data: s, isLoading } = useQuery({
        queryKey: ['dashboard', 'admin'],
        queryFn: async () => (await api.get('/dashboard/admin')).data,
    });

    const cards = [
        { label: 'Headcount', value: s?.headcount ?? '—', icon: Users, tone: 'brand' },
        { label: 'Present today', value: s?.present_today ?? '—', icon: UserCheck, tone: 'success' },
        { label: 'On leave', value: s?.on_leave ?? '—', icon: CalendarClock, tone: 'amber' },
        { label: 'Late today', value: s?.late_today ?? '—', icon: Clock, tone: 'danger' },
        { label: 'Positions', value: s?.open_positions ?? '—', icon: Briefcase, tone: 'brand' },
        { label: 'Pending approvals', value: s?.pending_approvals ?? '—', icon: ClipboardCheck, tone: 'amber' },
    ];

    return (
        <>
            <PageHeader title={`Good day, ${user?.name?.split(' ')[0] ?? 'there'}`} subtitle="What’s happening across your branches today." />

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                {cards.map((c, i) => <StatCard key={c.label} index={i} {...c} />)}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
                <Card className="lg:col-span-2">
                    <CardHeader><CardTitle>Attendance this week</CardTitle></CardHeader>
                    <CardBody>
                        {isLoading ? <LoadingBlock /> : (
                            <ResponsiveContainer width="100%" height={240}>
                                <AreaChart data={s?.attendance_trend ?? []}>
                                    <defs>
                                        <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.35} />
                                            <stop offset="100%" stopColor="var(--brand)" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                    <XAxis dataKey="date" tick={{ fontSize: 12, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 12, fill: 'var(--muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                                    <RTooltip contentStyle={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)' }} />
                                    <Area type="monotone" dataKey="present" stroke="var(--brand)" strokeWidth={2.5} fill="url(#g)" name="Present" />
                                </AreaChart>
                            </ResponsiveContainer>
                        )}
                    </CardBody>
                </Card>

                <Card>
                    <CardHeader><CardTitle>Headcount by department</CardTitle></CardHeader>
                    <CardBody>
                        {isLoading ? <LoadingBlock /> : (
                            <ResponsiveContainer width="100%" height={240}>
                                <BarChart data={s?.headcount_by_dept ?? []} layout="vertical" margin={{ left: 8 }}>
                                    <XAxis type="number" hide allowDecimals={false} />
                                    <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                                    <RTooltip contentStyle={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)' }} cursor={{ fill: 'var(--surface-2)' }} />
                                    <Bar dataKey="value" fill="var(--brand)" radius={[0, 6, 6, 0]} name="Employees" />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </CardBody>
                </Card>
            </div>

            <Card className="mt-6">
                <CardHeader>
                    <CardTitle>Upcoming events</CardTitle>
                    <button onClick={() => navigate('/app/events')} className="text-sm text-brand hover:underline">Manage events</button>
                </CardHeader>
                <CardBody>
                    {(s?.upcoming_events ?? []).length === 0 ? (
                        <EmptyState icon={CalendarDays} title="No upcoming events" message="Create one from the Events calendar." />
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {s.upcoming_events.map((e) => (
                                <div key={e.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
                                    <div className="flex flex-col items-center rounded-lg px-3 py-1.5 text-white" style={{ backgroundColor: e.color }}>
                                        <span className="text-[10px] uppercase">{format(parseISO(e.starts_at), 'MMM')}</span>
                                        <span className="text-lg font-semibold leading-none">{format(parseISO(e.starts_at), 'd')}</span>
                                    </div>
                                    <div className="min-w-0">
                                        <p className="truncate font-medium">{e.title}</p>
                                        {e.location && <p className="flex items-center gap-1 text-xs text-muted"><MapPin className="h-3 w-3" />{e.location}</p>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardBody>
            </Card>
        </>
    );
}
