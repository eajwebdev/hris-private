import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths,
    format, isSameMonth, isSameDay, parseISO,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Plus, CalendarDays, MapPin, Users, Check, HelpCircle, X } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/Modal';
import { LoadingBlock, LoadingBlock as Loading, EmptyState } from '@/components/ui/States';
import { cn } from '@/lib/utils';
import { EventForm } from './EventForm';

/** Who responded to an event, grouped by answer. */
function AttendeesModal({ event, onClose }) {
    const { data, isLoading } = useQuery({
        queryKey: ['events', 'attendees', event?.id],
        queryFn: async () => (await api.get(`/events/${event.id}/attendees`)).data,
        enabled: !!event,
    });

    const groups = [
        { key: 'going', label: 'Going', icon: Check, tone: 'success' },
        { key: 'maybe', label: 'Maybe', icon: HelpCircle, tone: 'amber' },
        { key: 'declined', label: "Can't go", icon: X, tone: 'danger' },
    ];

    const total = groups.reduce((n, g) => n + (data?.[g.key]?.length ?? 0), 0);

    return (
        <Modal open={!!event} onClose={onClose} size="lg" title={`Attendees · ${event?.title ?? ''}`}
            description={event?.rsvp_enabled ? 'Who has responded so far.' : 'RSVP is turned off for this event.'}>
            {isLoading ? <Loading /> : total === 0 ? (
                <EmptyState icon={Users} title="No responses yet"
                    message={event?.rsvp_enabled ? 'Employees will appear here as they RSVP.' : 'Turn RSVP on in the event to collect responses.'} />
            ) : (
                <div className="space-y-5">
                    {groups.map((g) => {
                        const people = data?.[g.key] ?? [];
                        if (people.length === 0) return null;
                        return (
                            <div key={g.key}>
                                <p className="mb-2 flex items-center gap-2 text-sm font-medium">
                                    <g.icon className="h-4 w-4" /> {g.label}
                                    <Badge tone={g.tone}>{people.length}</Badge>
                                </p>
                                <div className="space-y-1.5">
                                    {people.map((p) => (
                                        <div key={p.id} className="flex items-center gap-2.5 rounded-lg border border-border p-2">
                                            <Avatar name={p.name} size="sm" />
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-medium">{p.name}</p>
                                                {p.email && <p className="truncate text-xs text-muted">{p.email}</p>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </Modal>
    );
}

export default function EventsCalendar() {
    const { can } = useAuth();
    const [cursor, setCursor] = useState(new Date());
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [attendeesFor, setAttendeesFor] = useState(null);
    const [defaultDate, setDefaultDate] = useState(null);

    const monthStart = startOfMonth(cursor);
    const gridStart = startOfWeek(monthStart);
    const gridEnd = endOfWeek(endOfMonth(cursor));

    const { data, isLoading } = useQuery({
        queryKey: ['events', format(monthStart, 'yyyy-MM')],
        queryFn: async () =>
            (await api.get('/events', { params: { from: format(gridStart, 'yyyy-MM-dd'), to: format(gridEnd, 'yyyy-MM-dd') } })).data,
    });

    const eventsByDay = useMemo(() => {
        const map = {};
        (data?.data ?? []).forEach((e) => {
            const key = format(parseISO(e.starts_at), 'yyyy-MM-dd');
            (map[key] ??= []).push(e);
        });
        return map;
    }, [data]);

    const days = [];
    for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);

    function openCreate(date) {
        if (!can('events', 'create')) return;
        setEditing(null);
        setDefaultDate(date ? format(date, 'yyyy-MM-dd') : null);
        setFormOpen(true);
    }
    function openEdit(e) {
        setEditing(e);
        setDefaultDate(null);
        setFormOpen(true);
    }

    return (
        <>
            <PageHeader
                title="Events"
                subtitle="Company and branch events. Employees see these in their dashboard, view-only."
                actions={can('events', 'create') && (
                    <Button onClick={() => openCreate(new Date())}><Plus className="h-4 w-4" /> New event</Button>
                )}
            />

            <Card className="overflow-hidden">
                {/* Month toolbar */}
                <div className="flex items-center justify-between border-b border-border p-4">
                    <h2 className="text-lg font-semibold font-display">{format(cursor, 'MMMM yyyy')}</h2>
                    <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setCursor(addMonths(cursor, -1))} aria-label="Previous month"><ChevronLeft className="h-5 w-5" /></Button>
                        <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>Today</Button>
                        <Button variant="ghost" size="icon" onClick={() => setCursor(addMonths(cursor, 1))} aria-label="Next month"><ChevronRight className="h-5 w-5" /></Button>
                    </div>
                </div>

                {isLoading ? (
                    <LoadingBlock />
                ) : (
                    <div className="grid grid-cols-7">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                            <div key={d} className="border-b border-border p-2 text-center text-xs font-medium uppercase tracking-wide text-muted">{d}</div>
                        ))}
                        {days.map((day) => {
                            const key = format(day, 'yyyy-MM-dd');
                            const dayEvents = eventsByDay[key] ?? [];
                            const inMonth = isSameMonth(day, cursor);
                            const today = isSameDay(day, new Date());
                            return (
                                <div
                                    key={key}
                                    className={cn(
                                        'min-h-[104px] border-b border-r border-border p-1.5 last:border-r-0',
                                        !inMonth && 'bg-surface-2/40',
                                        can('events', 'create') && 'cursor-pointer hover:bg-surface-2/60'
                                    )}
                                    onClick={() => openCreate(day)}
                                >
                                    <div className="flex justify-end">
                                        <span className={cn(
                                            'flex h-6 w-6 items-center justify-center rounded-full text-xs',
                                            today ? 'bg-brand text-brand-ink font-semibold' : inMonth ? 'text-foreground' : 'text-muted'
                                        )}>{format(day, 'd')}</span>
                                    </div>
                                    <div className="mt-1 space-y-1">
                                        {dayEvents.slice(0, 3).map((e) => (
                                            <button
                                                key={e.id}
                                                onClick={(ev) => { ev.stopPropagation(); openEdit(e); }}
                                                className="block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium text-white"
                                                style={{ backgroundColor: e.color }}
                                                title={e.title}
                                            >
                                                {format(parseISO(e.starts_at), 'h:mma').toLowerCase()} {e.title}
                                            </button>
                                        ))}
                                        {dayEvents.length > 3 && <p className="px-1 text-[10px] text-muted">+{dayEvents.length - 3} more</p>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </Card>

            {/* Upcoming list under the calendar */}
            <div className="mt-6">
                <h3 className="mb-3 font-semibold font-display">Upcoming</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {(data?.data ?? [])
                        .filter((e) => parseISO(e.starts_at) >= new Date(new Date().setHours(0, 0, 0, 0)))
                        .slice(0, 6)
                        .map((e) => (
                            <div key={e.id} className="card-surface p-4 hover:border-brand">
                                <button onClick={() => openEdit(e)} className="w-full text-left">
                                    <div className="flex items-center gap-2">
                                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: e.color }} />
                                        <span className="text-xs text-muted">{format(parseISO(e.starts_at), 'EEE, MMM d · h:mma')}</span>
                                    </div>
                                    <p className="mt-1.5 font-medium">{e.title}</p>
                                    <div className="mt-1 flex items-center gap-3 text-xs text-muted">
                                        {e.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{e.location}</span>}
                                        <span>{e.branch ?? 'All branches'}</span>
                                    </div>
                                </button>

                                {e.rsvp_enabled && (
                                    <button
                                        onClick={() => setAttendeesFor(e)}
                                        className="mt-2.5 flex w-full items-center gap-1.5 border-t border-border pt-2.5 text-xs text-brand hover:underline"
                                    >
                                        <Users className="h-3.5 w-3.5" />
                                        {e.rsvp_counts?.going ?? 0} going
                                        {e.rsvp_counts?.maybe > 0 && ` · ${e.rsvp_counts.maybe} maybe`}
                                        <span className="ml-auto">View attendees</span>
                                    </button>
                                )}
                            </div>
                        ))}
                    {(data?.data ?? []).length === 0 && (
                        <div className="col-span-full flex flex-col items-center gap-2 py-10 text-center text-muted">
                            <CalendarDays className="h-8 w-8" />
                            <p className="text-sm">No events this month.{can('events', 'create') && ' Click a day to add one.'}</p>
                        </div>
                    )}
                </div>
            </div>

            <EventForm open={formOpen} onClose={() => setFormOpen(false)} event={editing} defaultDate={defaultDate} />
            <AttendeesModal event={attendeesFor} onClose={() => setAttendeesFor(null)} />
        </>
    );
}
