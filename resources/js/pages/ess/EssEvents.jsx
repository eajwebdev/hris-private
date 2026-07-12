import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { CalendarDays, MapPin, Check, HelpCircle, X, Users } from 'lucide-react';
import api, { apiError } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { LoadingBlock, EmptyState } from '@/components/ui/States';
import { cn } from '@/lib/utils';

const CHOICES = [
    { value: 'going', label: 'Going', icon: Check, active: 'border-success bg-success/15 text-success' },
    { value: 'maybe', label: 'Maybe', icon: HelpCircle, active: 'border-amber bg-amber/15 text-amber' },
    { value: 'declined', label: "Can't go", icon: X, active: 'border-danger bg-danger/12 text-danger' },
];

/** Three-way RSVP. Clicking the active choice again clears nothing — you must pick one. */
function RsvpButtons({ event, size = 'md' }) {
    const qc = useQueryClient();

    const respond = useMutation({
        mutationFn: (status) => api.post(`/events/${event.id}/rsvp`, { status }),
        onSuccess: ({ data }) => {
            toast.success(data.message);
            qc.invalidateQueries({ queryKey: ['events'] });
        },
        onError: (err) => toast.error(apiError(err)),
    });

    return (
        <div className="flex flex-wrap items-center gap-1.5">
            {CHOICES.map((c) => {
                const active = event.my_rsvp === c.value;
                return (
                    <button
                        key={c.value}
                        type="button"
                        disabled={respond.isPending}
                        aria-pressed={active}
                        onClick={(e) => { e.stopPropagation(); respond.mutate(c.value); }}
                        className={cn(
                            'inline-flex items-center gap-1.5 rounded-lg border font-medium transition-colors disabled:opacity-50',
                            size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
                            active ? c.active : 'border-border text-muted hover:bg-surface-2'
                        )}
                    >
                        <c.icon className="h-3.5 w-3.5" /> {c.label}
                    </button>
                );
            })}
        </div>
    );
}

function Counts({ counts }) {
    if (!counts) return null;
    return (
        <span className="flex items-center gap-1 text-xs text-muted">
            <Users className="h-3 w-3" />
            {counts.going} going
            {counts.maybe > 0 && ` · ${counts.maybe} maybe`}
        </span>
    );
}

export default function EssEvents() {
    const [viewEvent, setViewEvent] = useState(null);

    const { data, isLoading } = useQuery({
        queryKey: ['events', 'feed', 'all'],
        queryFn: async () => (await api.get('/events/feed', { params: { limit: 50 } })).data,
    });

    const events = data?.data ?? [];
    // Keep the open modal in step with refetched RSVP state.
    const current = viewEvent ? events.find((e) => e.id === viewEvent.id) ?? viewEvent : null;

    return (
        <>
            <PageHeader title="Events" subtitle="Company and branch events. Let HR know if you're coming." />

            <Card>
                <CardBody>
                    {isLoading ? (
                        <LoadingBlock />
                    ) : events.length === 0 ? (
                        <EmptyState icon={CalendarDays} title="No upcoming events" message="Check back later for company and branch events." />
                    ) : (
                        <div className="space-y-2">
                            {events.map((e) => (
                                <div
                                    key={e.id}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => setViewEvent(e)}
                                    onKeyDown={(k) => (k.key === 'Enter' || k.key === ' ') && setViewEvent(e)}
                                    className="flex w-full flex-wrap items-center gap-4 rounded-xl border border-border p-3 text-left hover:bg-surface-2 focus-visible:outline-2"
                                >
                                    <div className="flex flex-col items-center justify-center rounded-lg px-3.5 py-2 text-white" style={{ backgroundColor: e.color }}>
                                        <span className="text-[10px] uppercase">{format(parseISO(e.starts_at), 'MMM')}</span>
                                        <span className="text-xl font-semibold leading-none">{format(parseISO(e.starts_at), 'd')}</span>
                                    </div>

                                    <div className="min-w-0 flex-1">
                                        <p className="font-medium">{e.title}</p>
                                        <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-muted">
                                            <span>{format(parseISO(e.starts_at), 'EEEE · h:mm a')}</span>
                                            {e.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{e.location}</span>}
                                            <Badge tone="brand">{e.branch ?? 'All branches'}</Badge>
                                            {e.rsvp_enabled && <Counts counts={e.rsvp_counts} />}
                                        </div>
                                    </div>

                                    {e.rsvp_enabled
                                        ? <RsvpButtons event={e} size="sm" />
                                        : <Badge tone="neutral">No RSVP needed</Badge>}
                                </div>
                            ))}
                        </div>
                    )}
                </CardBody>
            </Card>

            <Modal
                open={!!current}
                onClose={() => setViewEvent(null)}
                title={current?.title}
                description={current && format(parseISO(current.starts_at), 'EEEE, MMMM d · h:mm a')}
            >
                {current && (
                    <div className="space-y-4">
                        <div className="flex flex-wrap gap-2">
                            {current.location && <Badge tone="neutral"><MapPin className="h-3 w-3" /> {current.location}</Badge>}
                            <Badge tone="brand">{current.branch ?? 'All branches'}</Badge>
                            {current.created_by && <Badge tone="neutral">By {current.created_by}</Badge>}
                        </div>

                        {current.description && <p className="whitespace-pre-line text-sm text-muted">{current.description}</p>}

                        {current.rsvp_enabled ? (
                            <div className="rounded-xl border border-border p-3">
                                <div className="mb-2 flex items-center justify-between gap-2">
                                    <p className="text-sm font-medium">Are you going?</p>
                                    <Counts counts={current.rsvp_counts} />
                                </div>
                                <RsvpButtons event={current} />
                            </div>
                        ) : (
                            <p className="text-xs italic text-muted">No RSVP is needed for this event.</p>
                        )}
                    </div>
                )}
            </Modal>
        </>
    );
}
