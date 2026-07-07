import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { Clock, CalendarDays, MapPin, LogIn, ArrowRight, Eye } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, statusTone } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/States';
import { formatTime } from '@/lib/utils';

export default function EssDashboard() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [viewEvent, setViewEvent] = useState(null);

    const { data: summary } = useQuery({ queryKey: ['dashboard', 'ess'], queryFn: async () => (await api.get('/dashboard/ess')).data });
    const { data: events } = useQuery({ queryKey: ['events', 'feed'], queryFn: async () => (await api.get('/events/feed', { params: { limit: 6 } })).data });

    const emp = summary?.employee;
    const today = summary?.today ?? { next_action: 'in', worked_hours: 0, punches: [] };
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
                        <Button className="mt-4 w-full" variant={today.next_action === 'in' ? 'primary' : 'danger'} onClick={() => navigate('/ess/clock')}>
                            <LogIn className="h-4 w-4" /> Clock {today.next_action === 'in' ? 'In' : 'Out'}
                        </Button>
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
                                        className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left hover:bg-surface-2">
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
