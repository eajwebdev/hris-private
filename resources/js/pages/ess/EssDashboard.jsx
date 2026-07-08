import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { motion } from 'framer-motion';
import {
    Clock, CalendarDays, MapPin, LogIn, ArrowRight, Eye,
    AlarmClockOff, DoorOpen, Hourglass, CalendarCheck2, Timer, Sunrise, Sunset, Megaphone, Pin,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, statusTone } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/States';
import { formatTime, minutesLabel, cn } from '@/lib/utils';

/** One AM/PM checkpoint cell in the DTR row. */
function DtrCell({ label, value, tone = 'neutral' }) {
    const tones = { neutral: 'text-foreground', late: 'text-danger', early: 'text-amber' };
    return (
        <div className="rounded-xl border border-border bg-surface-2/40 px-2 py-2 text-center">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted">{label}</p>
            <p className={cn('mt-1 font-mono text-sm font-semibold', value ? tones[tone] : 'text-muted')}>
                {value ? formatTime(value) : '--'}
            </p>
        </div>
    );
}

/** Small punctuality stat tile — count + exact minutes, colored by severity. */
function PunctualityTile({ icon: Icon, label, value, detail, tone = 'neutral', index = 0 }) {
    const tones = {
        neutral: 'bg-surface-2 text-muted',
        good: 'bg-success/15 text-success',
        warn: 'bg-amber/15 text-amber',
        bad: 'bg-danger/10 text-danger',
    };
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="card-surface card-hover p-4"
        >
            <div className="flex items-center gap-3">
                <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', tones[tone])}>
                    <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                    <p className="text-xs text-muted">{label}</p>
                    <p className="font-display text-xl font-semibold tabular leading-tight">{value}</p>
                    {detail && <p className="text-[11px] text-muted">{detail}</p>}
                </div>
            </div>
        </motion.div>
    );
}

export default function EssDashboard() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [viewEvent, setViewEvent] = useState(null);

    const { data: summary } = useQuery({ queryKey: ['dashboard', 'ess'], queryFn: async () => (await api.get('/dashboard/ess')).data });
    const { data: events } = useQuery({ queryKey: ['events', 'feed'], queryFn: async () => (await api.get('/events/feed', { params: { limit: 6 } })).data });
    const { data: news } = useQuery({ queryKey: ['announcements', 'feed'], queryFn: async () => (await api.get('/announcements/feed', { params: { limit: 5 } })).data });

    const emp = summary?.employee;
    const today = summary?.today ?? { next_action: 'in', worked_hours: 0, punches: [], late_minutes: 0, early_out_minutes: 0, undertime_minutes: 0 };
    const month = summary?.month;
    const schedule = summary?.schedule;
    const recentDtr = summary?.recent_dtr ?? [];
    const feed = events?.data ?? [];

    return (
        <>
            {/* Greeting + identity */}
            <div className="flex items-center gap-4 mb-6">
                <Avatar name={emp?.name ?? user?.name} src={emp?.photo_url} size="lg" />
                <div>
                    <h1 className="text-2xl font-semibold font-display">Hi, {(emp?.name ?? user?.name)?.split(' ')[0]}</h1>
                    <p className="text-sm text-muted">
                        {emp ? `${emp.position ?? 'Employee'} · ${emp.branch}` : 'Welcome to your self-service portal'}
                        {emp?.status && <Badge tone={statusTone(emp.status)} className="ml-2 capitalize">{emp.status}</Badge>}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Clock card */}
                <Card className="lg:col-span-1">
                    <CardBody>
                        <div className="flex items-center justify-between">
                            <CardTitle>Attendance</CardTitle>
                            <Clock className="h-5 w-5 text-brand" />
                        </div>
                        <p className="mt-3 text-sm text-muted">
                            {today.punches.length === 0 ? 'You haven’t clocked in yet today.' : `You’re currently clocked ${today.next_action === 'out' ? 'in' : 'out'}.`}
                        </p>
                        <div className="mt-3 flex items-center gap-4">
                            <div>
                                <p className="font-mono text-2xl font-semibold">{today.worked_hours}h</p>
                                <p className="text-xs text-muted">worked today</p>
                            </div>
                            {today.punches[0]?.in && (
                                <div>
                                    <p className="font-mono text-2xl font-semibold">{formatTime(today.punches[0].in)}</p>
                                    <p className="text-xs text-muted">first in</p>
                                </div>
                            )}
                        </div>
                        {/* Today's punctuality verdict — exact minutes vs schedule */}
                        {today.punches.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                                {today.late_minutes > 0
                                    ? <Badge tone="danger"><AlarmClockOff className="h-3 w-3" /> Late {minutesLabel(today.late_minutes)}</Badge>
                                    : <Badge tone="success"><CalendarCheck2 className="h-3 w-3" /> On time</Badge>}
                                {today.early_out_minutes > 0 && (
                                    <Badge tone="amber"><DoorOpen className="h-3 w-3" /> Early out {minutesLabel(today.early_out_minutes)}</Badge>
                                )}
                                {today.undertime_minutes > 0 && (
                                    <Badge tone="amber"><Hourglass className="h-3 w-3" /> Undertime {minutesLabel(today.undertime_minutes)}</Badge>
                                )}
                            </div>
                        )}
                        <Button className="mt-4 w-full" variant={today.next_action === 'in' ? 'primary' : 'danger'} onClick={() => navigate('/ess/clock')}>
                            <LogIn className="h-4 w-4" /> Clock {today.next_action === 'in' ? 'In' : 'Out'}
                        </Button>

                        {/* Work schedule the calculations are based on */}
                        {schedule && (
                            <div className="mt-4 rounded-xl border border-border bg-surface-2/60 p-3">
                                <p className="text-xs font-medium text-muted mb-2">{schedule.name ?? 'Work schedule'} · grace {schedule.grace_minutes}m</p>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div className="flex items-center gap-1.5 text-muted">
                                        <Sunrise className="h-3.5 w-3.5 text-amber" />
                                        {formatTime(schedule.morning_in)} – {formatTime(schedule.morning_out)}
                                    </div>
                                    <div className="flex items-center gap-1.5 text-muted">
                                        <Sunset className="h-3.5 w-3.5 text-brand" />
                                        {formatTime(schedule.afternoon_in)} – {formatTime(schedule.afternoon_out)}
                                    </div>
                                </div>
                            </div>
                        )}
                    </CardBody>
                </Card>

                {/* Upcoming events — view only */}
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle>Upcoming events</CardTitle>
                        <button onClick={() => navigate('/ess/events')} className="flex items-center gap-1 text-sm text-brand hover:underline">
                            View all <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                    </CardHeader>
                    <CardBody>
                        {feed.length === 0 ? (
                            <EmptyState icon={CalendarDays} title="No upcoming events" message="Company and branch events will appear here." />
                        ) : (
                            <div className="space-y-2">
                                {feed.map((e) => (
                                    <button key={e.id} onClick={() => setViewEvent(e)}
                                        className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left hover:bg-surface-2 transition-colors">
                                        <div className="flex flex-col items-center justify-center rounded-lg px-3 py-1.5 text-white" style={{ backgroundColor: e.color }}>
                                            <span className="text-[10px] uppercase">{format(parseISO(e.starts_at), 'MMM')}</span>
                                            <span className="text-lg font-semibold leading-none">{format(parseISO(e.starts_at), 'd')}</span>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate font-medium">{e.title}</p>
                                            <div className="flex items-center gap-3 text-xs text-muted">
                                                <span>{format(parseISO(e.starts_at), 'EEE · h:mma')}</span>
                                                {e.location && <span className="flex items-center gap-1 truncate"><MapPin className="h-3 w-3" />{e.location}</span>}
                                            </div>
                                        </div>
                                        <Badge tone="neutral"><Eye className="h-3 w-3" /> View</Badge>
                                    </button>
                                ))}
                            </div>
                        )}
                    </CardBody>
                </Card>
            </div>

            {/* Recent Daily Time Record */}
            {recentDtr.length > 0 && (
                <Card className="mt-6">
                    <CardBody>
                        <div className="mb-3 flex items-center justify-between">
                            <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
                                <Clock className="h-5 w-5 text-brand" /> Recent DTR
                            </h2>
                            <button onClick={() => navigate('/ess/clock')} className="flex items-center gap-1 text-sm text-brand hover:underline">
                                Time clock <ArrowRight className="h-3.5 w-3.5" />
                            </button>
                        </div>
                        <div className="divide-y divide-border">
                            {recentDtr.map((r) => (
                                <div key={r.date} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
                                    <div className="shrink-0 sm:w-44">
                                        <p className="font-display font-semibold">{format(parseISO(r.date), 'MMM dd')}</p>
                                        {schedule && (
                                            <div className="mt-0.5 text-[11px] text-muted">
                                                <p>AM {formatTime(schedule.morning_in)} – {formatTime(schedule.morning_out)}</p>
                                                <p>PM {formatTime(schedule.afternoon_in)} – {formatTime(schedule.afternoon_out)}</p>
                                            </div>
                                        )}
                                    </div>
                                    <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
                                        <DtrCell label="AM In" value={r.dtr.am_in} tone={r.late_minutes > 0 ? 'late' : 'neutral'} />
                                        <DtrCell label="AM Out" value={r.dtr.am_out} tone={r.undertime_minutes > 0 ? 'early' : 'neutral'} />
                                        <DtrCell label="PM In" value={r.dtr.pm_in} />
                                        <DtrCell label="PM Out" value={r.dtr.pm_out} tone={r.early_out_minutes > 0 ? 'early' : 'neutral'} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardBody>
                </Card>
            )}

            {/* Punctuality this month — exact minutes computed against the work schedule */}
            {month && (
                <div className="mt-6">
                    <div className="mb-3 flex items-end justify-between">
                        <h2 className="font-display text-lg font-semibold">Punctuality · {month.label}</h2>
                        <button onClick={() => navigate('/ess/clock')} className="flex items-center gap-1 text-sm text-brand hover:underline">
                            Time clock <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
                        <PunctualityTile index={0} icon={CalendarCheck2} label="Days present" tone="good"
                            value={month.days_present} />
                        <PunctualityTile index={1} icon={AlarmClockOff} label="Times late" tone={month.late_count > 0 ? 'bad' : 'good'}
                            value={month.late_count} detail={month.late_minutes > 0 ? `${minutesLabel(month.late_minutes)} total` : 'No late minutes'} />
                        <PunctualityTile index={2} icon={DoorOpen} label="Early outs" tone={month.early_out_count > 0 ? 'warn' : 'good'}
                            value={month.early_out_count} detail={month.early_out_minutes > 0 ? `${minutesLabel(month.early_out_minutes)} total` : 'Full days'} />
                        <PunctualityTile index={3} icon={Hourglass} label="Undertime" tone={month.undertime_minutes > 0 ? 'warn' : 'good'}
                            value={minutesLabel(month.undertime_minutes)} />
                        <PunctualityTile index={4} icon={Timer} label="Hours worked" tone="neutral"
                            value={`${month.worked_hours}h`} />
                    </div>
                </div>
            )}

            {/* Announcements feed */}
            {(news?.data ?? []).length > 0 && (
                <Card className="mt-6">
                    <CardBody>
                        <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold">
                            <Megaphone className="h-5 w-5 text-brand" /> Announcements
                        </h2>
                        <div className="space-y-3">
                            {news.data.map((a) => (
                                <div key={a.id} className="rounded-xl border border-border p-3.5">
                                    <div className="flex flex-wrap items-center gap-2">
                                        {a.is_pinned && <Pin className="h-3.5 w-3.5 text-amber" />}
                                        <p className="font-medium">{a.title}</p>
                                        {a.priority !== 'normal' && (
                                            <Badge tone={a.priority === 'urgent' ? 'danger' : 'amber'} className="capitalize">{a.priority}</Badge>
                                        )}
                                    </div>
                                    <p className="mt-1 whitespace-pre-line text-sm text-muted">{a.body}</p>
                                    <p className="mt-1.5 text-xs text-muted">
                                        {format(parseISO(a.published_at), 'MMM d, yyyy')} · {a.branch ?? 'All branches'}{a.created_by && ` · ${a.created_by}`}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </CardBody>
                </Card>
            )}

            {/* View-only event modal */}
            <Modal open={!!viewEvent} onClose={() => setViewEvent(null)} title={viewEvent?.title}
                description={viewEvent && format(parseISO(viewEvent.starts_at), 'EEEE, MMMM d · h:mm a')}>
                {viewEvent && (
                    <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                            {viewEvent.location && <Badge tone="neutral"><MapPin className="h-3 w-3" /> {viewEvent.location}</Badge>}
                            <Badge tone="brand">{viewEvent.branch ?? 'All branches'}</Badge>
                            {viewEvent.created_by && <Badge tone="neutral">By {viewEvent.created_by}</Badge>}
                        </div>
                        {viewEvent.description && <p className="text-sm text-muted whitespace-pre-line">{viewEvent.description}</p>}
                        <p className="text-xs text-muted italic">This is a read-only view. Contact HR for questions about this event.</p>
                    </div>
                )}
            </Modal>
        </>
    );
}
