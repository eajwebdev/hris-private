import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { motion } from 'framer-motion';
import {
    Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip as RTooltip, BarChart, Bar, CartesianGrid, Legend,
} from 'recharts';
import { Users, UserCheck, UserX, CalendarClock, Clock, Briefcase, ClipboardCheck, CalendarDays, MapPin, DoorOpen } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { LoadingBlock, EmptyState } from '@/components/ui/States';
import { minutesLabel } from '@/lib/utils';

const tooltipStyle = { borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink-text)' };

/** Animated presence ring — % of headcount present today. */
function PresenceRing({ present = 0, headcount = 0, loading }) {
    const pct = headcount > 0 ? Math.round((present / headcount) * 100) : 0;
    const r = 52;
    const c = 2 * Math.PI * r;
    return (
        <Card className="card-hover relative overflow-hidden p-5 flex flex-col items-center justify-center">
            <div className="absolute inset-x-0 top-0 h-0.5 bg-linear-to-r from-brand/60 to-transparent" />
            <p className="self-start text-sm text-muted">Presence rate</p>
            <div className="relative mt-2">
                <svg width="128" height="128" viewBox="0 0 128 128" role="img" aria-label={`${pct}% of employees present today`}>
                    <circle cx="64" cy="64" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="10" />
                    <motion.circle
                        cx="64" cy="64" r={r} fill="none"
                        stroke="var(--brand)" strokeWidth="10" strokeLinecap="round"
                        strokeDasharray={c}
                        initial={{ strokeDashoffset: c }}
                        animate={{ strokeDashoffset: loading ? c : c - (c * pct) / 100 }}
                        transition={{ duration: 1, ease: 'easeOut' }}
                        transform="rotate(-90 64 64)"
                    />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="font-display text-3xl font-bold tabular">{loading ? '—' : `${pct}%`}</span>
                    <span className="text-[11px] text-muted">{present}/{headcount} in</span>
                </div>
            </div>
        </Card>
    );
}

export default function Dashboard() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { data: s, isLoading } = useQuery({
        queryKey: ['dashboard', 'admin'],
        queryFn: async () => (await api.get('/dashboard/admin')).data,
    });

    const pct = (n) => (s?.headcount > 0 ? `${Math.round((n / s.headcount) * 100)}% of workforce` : null);
    const cards = [
        { label: 'Headcount', value: s?.headcount ?? '—', icon: Users, tone: 'brand', detail: 'Active employees' },
        { label: 'Present today', value: s?.present_today ?? '—', icon: UserCheck, tone: 'success', detail: pct(s?.present_today ?? 0) },
        { label: 'Absent today', value: s?.absent_today ?? '—', icon: UserX, tone: 'danger', detail: pct(s?.absent_today ?? 0) },
        { label: 'Late today', value: s?.late_today ?? '—', icon: Clock, tone: 'amber', detail: s?.late_minutes_today > 0 ? `${minutesLabel(s.late_minutes_today)} total` : 'No late minutes' },
        { label: 'Early outs', value: s?.early_out_today ?? '—', icon: DoorOpen, tone: 'amber', detail: 'Left before schedule' },
        { label: 'On leave', value: s?.on_leave ?? '—', icon: CalendarClock, tone: 'brand', detail: 'Approved today' },
        { label: 'Open positions', value: s?.open_positions ?? '—', icon: Briefcase, tone: 'brand', detail: 'Across all branches' },
        { label: 'Pending approvals', value: s?.pending_approvals ?? '—', icon: ClipboardCheck, tone: 'amber', detail: 'Awaiting action' },
    ];

    return (
        <>
            <PageHeader
                title={`Good day, ${user?.name?.split(' ')[0] ?? 'there'}`}
                subtitle="What’s happening across your branches today."
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {cards.map((c, i) => <StatCard key={c.label} index={i} {...c} />)}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mt-6">
                {/* Attendance + lateness, one shared count axis */}
                <Card className="lg:col-span-3">
                    <CardHeader><CardTitle>Attendance this week</CardTitle></CardHeader>
                    <CardBody>
                        {isLoading ? <LoadingBlock /> : (
                            <ResponsiveContainer width="100%" height={260}>
                                <AreaChart data={s?.attendance_trend ?? []}>
                                    <defs>
                                        <linearGradient id="gPresent" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.3} />
                                            <stop offset="100%" stopColor="var(--brand)" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                    <XAxis dataKey="date" tick={{ fontSize: 12, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 12, fill: 'var(--muted)' }} axisLine={false} tickLine={false} allowDecimals={false} width={30} />
                                    <RTooltip contentStyle={tooltipStyle} />
                                    <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
                                    <Area type="monotone" dataKey="present" stroke="var(--brand)" strokeWidth={2}
                                        fill="url(#gPresent)" name="Present" dot={false} activeDot={{ r: 4 }} />
                                    <Area type="monotone" dataKey="late" stroke="var(--chart-late)" strokeWidth={2}
                                        fill="none" name="Late" dot={false} activeDot={{ r: 4 }} />
                                </AreaChart>
                            </ResponsiveContainer>
                        )}
                    </CardBody>
                </Card>

                <PresenceRing present={s?.present_today ?? 0} headcount={s?.headcount ?? 0} loading={isLoading} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
                <Card>
                    <CardHeader><CardTitle>Headcount by department</CardTitle></CardHeader>
                    <CardBody>
                        {isLoading ? <LoadingBlock /> : (
                            <ResponsiveContainer width="100%" height={240}>
                                <BarChart data={s?.headcount_by_dept ?? []} layout="vertical" margin={{ left: 8 }} barCategoryGap="25%">
                                    <XAxis type="number" hide allowDecimals={false} />
                                    <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                                    <RTooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--surface-2)' }} />
                                    <Bar dataKey="value" fill="var(--brand)" radius={[0, 4, 4, 0]} name="Employees" maxBarSize={18} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </CardBody>
                </Card>

                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle>Upcoming events</CardTitle>
                        <button onClick={() => navigate('/app/events')} className="text-sm text-brand hover:underline">Manage events</button>
                    </CardHeader>
                    <CardBody>
                        {(s?.upcoming_events ?? []).length === 0 ? (
                            <EmptyState icon={CalendarDays} title="No upcoming events" message="Create one from the Events calendar." />
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {s.upcoming_events.map((e) => (
                                    <div key={e.id} className="flex items-center gap-3 rounded-xl border border-border p-3 hover:bg-surface-2 transition-colors">
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
            </div>
        </>
    );
}
