import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { CalendarDays, MapPin, Eye } from 'lucide-react';
import api from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { LoadingBlock, EmptyState } from '@/components/ui/States';

export default function EssEvents() {
    const [viewEvent, setViewEvent] = useState(null);
    const { data, isLoading } = useQuery({
        queryKey: ['events', 'feed', 'all'],
        queryFn: async () => (await api.get('/events/feed', { params: { limit: 50 } })).data,
    });
    const events = data?.data ?? [];

    return (
        <>
            <PageHeader title="Events" subtitle="Company and branch events. Viewing only — organized by HR." />
            <Card>
                <CardBody>
                    {isLoading ? (
                        <LoadingBlock />
                    ) : events.length === 0 ? (
                        <EmptyState icon={CalendarDays} title="No upcoming events" message="Check back later for company and branch events." />
                    ) : (
                        <div className="space-y-2">
                            {events.map((e) => (
                                <button key={e.id} onClick={() => setViewEvent(e)}
                                    className="flex w-full items-center gap-4 rounded-xl border border-border p-3 text-left hover:bg-surface-2">
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
                                        </div>
                                    </div>
                                    <Badge tone="neutral"><Eye className="h-3 w-3" /> View</Badge>
                                </button>
                            ))}
                        </div>
                    )}
                </CardBody>
            </Card>

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
                        <p className="text-xs text-muted italic">This is a read-only view.</p>
                    </div>
                )}
            </Modal>
        </>
    );
}
