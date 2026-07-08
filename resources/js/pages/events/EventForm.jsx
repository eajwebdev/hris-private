import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import api, { apiError } from '@/lib/api';
import { useBranches } from '@/hooks/useLookups';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Field, Input, Textarea, Select } from '@/components/ui/Field';
import { useAuth } from '@/context/AuthContext';

const COLORS = ['#d61b5d', '#0a1134', '#5b7cfa', '#e39a3b', '#1d9e6f', '#7c3aed'];

function toLocalInput(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const off = d.getTimezoneOffset();
    return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export function EventForm({ open, onClose, event, defaultDate }) {
    const qc = useQueryClient();
    const { can } = useAuth();
    const { data: branches } = useBranches();
    const isEdit = !!event?.id;
    const [confirmDel, setConfirmDel] = useState(false);
    const [form, setForm] = useState({});

    useEffect(() => {
        if (open) {
            setForm(
                event?.id
                    ? {
                          title: event.title ?? '', description: event.description ?? '', location: event.location ?? '',
                          branch_id: event.branch_id ?? '', starts_at: toLocalInput(event.starts_at),
                          ends_at: toLocalInput(event.ends_at), rsvp_enabled: event.rsvp_enabled ?? false, color: event.color ?? COLORS[0],
                      }
                    : {
                          title: '', description: '', location: '', branch_id: '',
                          starts_at: defaultDate ? `${defaultDate}T09:00` : '', ends_at: '', rsvp_enabled: false, color: COLORS[0],
                      }
            );
        }
    }, [open, event, defaultDate]);

    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    const save = useMutation({
        mutationFn: () => {
            const payload = { ...form, branch_id: form.branch_id || null, ends_at: form.ends_at || null };
            return isEdit ? api.put(`/events/${event.id}`, payload) : api.post('/events', payload);
        },
        onSuccess: () => {
            toast.success(isEdit ? 'Event updated.' : 'Event created — employees have been notified.');
            qc.invalidateQueries({ queryKey: ['events'] });
            onClose();
        },
        onError: (e) => toast.error(apiError(e)),
    });

    const del = useMutation({
        mutationFn: () => api.delete(`/events/${event.id}`),
        onSuccess: () => {
            toast.success('Event deleted.');
            qc.invalidateQueries({ queryKey: ['events'] });
            setConfirmDel(false);
            onClose();
        },
        onError: (e) => toast.error(apiError(e)),
    });

    return (
        <>
            <Modal
                open={open}
                onClose={onClose}
                title={isEdit ? 'Edit event' : 'Create event'}
                description="Company-wide unless you pick a branch. Employees see it in their dashboard (view-only)."
                footer={
                    <div className="flex w-full items-center justify-between">
                        <div>
                            {isEdit && can('events', 'delete') && (
                                <IconButton label="Delete event" icon={Trash2} tone="danger" onClick={() => setConfirmDel(true)} />
                            )}
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={onClose}>Cancel</Button>
                            <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!form.title || !form.starts_at}>
                                {isEdit ? 'Save' : 'Create event'}
                            </Button>
                        </div>
                    </div>
                }
            >
                <div className="space-y-3">
                    <Field label="Title"><Input value={form.title ?? ''} onChange={set('title')} placeholder="e.g. Company Town Hall" /></Field>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Starts"><Input type="datetime-local" value={form.starts_at ?? ''} onChange={set('starts_at')} /></Field>
                        <Field label="Ends (optional)"><Input type="datetime-local" value={form.ends_at ?? ''} onChange={set('ends_at')} /></Field>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Location"><Input value={form.location ?? ''} onChange={set('location')} placeholder="Where" /></Field>
                        <Field label="Audience">
                            <Select value={form.branch_id ?? ''} onChange={set('branch_id')}>
                                <option value="">All branches (company-wide)</option>
                                {branches?.map((b) => <option key={b.id} value={b.id}>{b.name} only</option>)}
                            </Select>
                        </Field>
                    </div>
                    <Field label="Description"><Textarea value={form.description ?? ''} onChange={set('description')} rows={3} /></Field>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium mb-1.5">Color</p>
                            <div className="flex gap-2">
                                {COLORS.map((c) => (
                                    <button key={c} type="button" onClick={() => setForm((f) => ({ ...f, color: c }))}
                                        className={`h-7 w-7 rounded-full border-2 ${form.color === c ? 'border-foreground' : 'border-transparent'}`}
                                        style={{ backgroundColor: c }} aria-label={c} />
                                ))}
                            </div>
                        </div>
                        <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={!!form.rsvp_enabled} onChange={(e) => setForm((f) => ({ ...f, rsvp_enabled: e.target.checked }))} />
                            Enable RSVP
                        </label>
                    </div>
                </div>
            </Modal>

            <ConfirmDialog open={confirmDel} onClose={() => setConfirmDel(false)} onConfirm={() => del.mutate()}
                loading={del.isPending} title="Delete event?" message={`“${event?.title}” will be removed.`} confirmLabel="Delete" />
        </>
    );
}
