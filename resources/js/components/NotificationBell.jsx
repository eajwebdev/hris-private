import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Calendar, Megaphone, Sparkles, Info, Check } from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';

const ICONS = { calendar: Calendar, megaphone: Megaphone, sparkles: Sparkles, info: Info };

function timeAgo(date) {
    const s = Math.floor((Date.now() - new Date(date)) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
}

export function NotificationBell() {
    const [open, setOpen] = useState(false);
    const qc = useQueryClient();
    const navigate = useNavigate();

    const { data } = useQuery({
        queryKey: ['notifications'],
        queryFn: async () => (await api.get('/notifications')).data,
        refetchInterval: 45_000,
    });

    const readAll = useMutation({
        mutationFn: () => api.post('/notifications/read-all'),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
    });
    const readOne = useMutation({
        mutationFn: (id) => api.post(`/notifications/${id}/read`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
    });

    const unread = data?.unread ?? 0;
    const items = data?.items ?? [];

    function openItem(n) {
        if (!n.read_at) readOne.mutate(n.id);
        setOpen(false);
        if (n.link) navigate(n.link);
    }

    return (
        <div className="relative">
            <button
                onClick={() => setOpen((o) => !o)}
                className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2"
                aria-label="Notifications"
            >
                <Bell className="h-5 w-5" />
                {unread > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
                        {unread > 9 ? '9+' : unread}
                    </span>
                )}
            </button>

            <AnimatePresence>
                {open && (
                    <>
                        <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
                        <motion.div
                            initial={{ opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            className="absolute right-0 z-20 mt-2 w-80 max-w-[calc(100vw-2rem)] card-surface overflow-hidden"
                        >
                            <div className="flex items-center justify-between border-b border-border p-3">
                                <p className="font-semibold text-sm">Notifications</p>
                                {unread > 0 && (
                                    <button onClick={() => readAll.mutate()} className="flex items-center gap-1 text-xs text-brand hover:underline">
                                        <Check className="h-3.5 w-3.5" /> Mark all read
                                    </button>
                                )}
                            </div>
                            <div className="max-h-96 overflow-y-auto">
                                {items.length === 0 ? (
                                    <p className="p-6 text-center text-sm text-muted">You’re all caught up.</p>
                                ) : (
                                    items.map((n) => {
                                        const Icon = ICONS[n.icon] ?? Info;
                                        return (
                                            <button
                                                key={n.id}
                                                onClick={() => openItem(n)}
                                                className={cn(
                                                    'flex w-full items-start gap-3 border-b border-border p-3 text-left hover:bg-surface-2',
                                                    !n.read_at && 'bg-brand-soft/40'
                                                )}
                                            >
                                                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                                                    <Icon className="h-4 w-4" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-medium leading-tight">{n.title}</p>
                                                    {n.body && <p className="mt-0.5 text-xs text-muted line-clamp-2">{n.body}</p>}
                                                    <p className="mt-1 text-[11px] text-muted">{timeAgo(n.created_at)}</p>
                                                </div>
                                                {!n.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />}
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}
