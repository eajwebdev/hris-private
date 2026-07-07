import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { MapPin, Camera, CheckCircle2, AlertTriangle, LogIn, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import api, { apiError } from '@/lib/api';
import { useClockCapture } from '@/hooks/useClockCapture';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { cn, formatTime } from '@/lib/utils';

const RING = 130; // radius
const CIRC = 2 * Math.PI * RING;

export default function ClockScreen() {
    const qc = useQueryClient();
    const { videoRef, cameraReady, cameraError, coords, geoError, geoProgress, locked, capture } = useClockCapture();
    const [pulse, setPulse] = useState(false);

    const { data } = useQuery({
        queryKey: ['attendance', 'today'],
        queryFn: async () => (await api.get('/attendance/today')).data,
        refetchInterval: 60_000,
    });

    const nextAction = data?.next_action ?? 'in';

    const punchMut = useMutation({
        mutationFn: async () => {
            const blob = await capture();
            const fd = new FormData();
            fd.append('type', nextAction);
            if (coords) {
                fd.append('lat', coords.lat);
                fd.append('lng', coords.lng);
                fd.append('accuracy', coords.accuracy);
            }
            if (blob) fd.append('photo', blob, 'punch.jpg');
            return api.post('/attendance/punch', fd);
        },
        onSuccess: ({ data: res }) => {
            toast.success(res.message);
            setPulse(true);
            setTimeout(() => setPulse(false), 1200);
            qc.invalidateQueries({ queryKey: ['attendance', 'today'] });
        },
        onError: (e) => toast.error(apiError(e)),
    });

    const canPunch = cameraReady && locked && !punchMut.isPending;

    return (
        <>
            <PageHeader title="Clock In / Out" subtitle="Face the camera and hold still while your location locks." />

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
                <Card>
                    <CardBody className="flex flex-col items-center py-8">
                        {/* Presence Ring */}
                        <div className={cn('relative', pulse && 'presence-pulse rounded-full')}>
                            <svg width={(RING + 14) * 2} height={(RING + 14) * 2} className="rotate-[-90deg]">
                                <circle cx={RING + 14} cy={RING + 14} r={RING} fill="none" stroke="var(--border)" strokeWidth="6" />
                                <motion.circle
                                    cx={RING + 14} cy={RING + 14} r={RING} fill="none"
                                    stroke={locked ? 'var(--brand)' : 'var(--amber)'} strokeWidth="6" strokeLinecap="round"
                                    strokeDasharray={CIRC}
                                    animate={{ strokeDashoffset: CIRC * (1 - geoProgress) }}
                                    transition={{ type: 'spring', stiffness: 60, damping: 15 }}
                                />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="relative h-[248px] w-[248px] overflow-hidden rounded-full bg-ink">
                                    <video ref={videoRef} playsInline muted className="h-full w-full object-cover -scale-x-100" />
                                    {!cameraReady && !cameraError && (
                                        <div className="absolute inset-0 flex items-center justify-center text-sidebar-text text-sm">Starting camera…</div>
                                    )}
                                    {cameraError && (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-white">
                                            <Camera className="h-6 w-6" /><p className="text-xs">{cameraError}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Geo status */}
                        <div className="mt-6 flex items-center gap-2 text-sm">
                            {locked ? (
                                <Badge tone="success"><CheckCircle2 className="h-3.5 w-3.5" /> Location locked</Badge>
                            ) : geoError ? (
                                <Badge tone="danger"><AlertTriangle className="h-3.5 w-3.5" /> {geoError}</Badge>
                            ) : (
                                <Badge tone="amber"><MapPin className="h-3.5 w-3.5" /> Locking location… {Math.round(geoProgress * 100)}%</Badge>
                            )}
                        </div>
                        {coords && (
                            <p className="mt-2 font-mono text-xs text-muted">
                                {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)} · ±{Math.round(coords.accuracy)}m
                            </p>
                        )}

                        <Button
                            size="lg"
                            variant={nextAction === 'in' ? 'primary' : 'danger'}
                            className="mt-6 w-56"
                            disabled={!canPunch}
                            loading={punchMut.isPending}
                            onClick={() => punchMut.mutate()}
                        >
                            {nextAction === 'in' ? <LogIn className="h-5 w-5" /> : <LogOut className="h-5 w-5" />}
                            Clock {nextAction === 'in' ? 'In' : 'Out'}
                        </Button>
                        {!locked && !geoError && <p className="mt-2 text-xs text-muted">Waiting for a location lock before you can punch.</p>}
                    </CardBody>
                </Card>

                {/* Today summary */}
                <Card className="h-fit">
                    <CardBody>
                        <h3 className="font-semibold font-display">Today</h3>
                        <p className="text-sm text-muted">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>

                        <div className="mt-4 space-y-2">
                            {(data?.attendance?.punches ?? []).length === 0 && (
                                <p className="text-sm text-muted">No punches yet today. Your first clock-in starts the day.</p>
                            )}
                            {(data?.attendance?.punches ?? []).map((p, i) => (
                                <div key={i} className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-sm">
                                    <span className="flex items-center gap-1.5 text-success"><LogIn className="h-3.5 w-3.5" /> {formatTime(p.in)}</span>
                                    <span className="flex items-center gap-1.5 text-muted"><LogOut className="h-3.5 w-3.5" /> {p.out ? formatTime(p.out) : '—'}</span>
                                </div>
                            ))}
                        </div>

                        {data?.attendance && (
                            <div className="mt-4 grid grid-cols-2 gap-2 text-center">
                                <Stat label="Worked" value={`${data.attendance.worked_hours}h`} />
                                <Stat label="Late" value={`${data.attendance.late_am_minutes + data.attendance.late_pm_minutes}m`} />
                            </div>
                        )}

                        {data?.schedule && (
                            <p className="mt-4 text-xs text-muted">
                                Schedule: {data.schedule.name} · {data.schedule.morning_in?.slice(0, 5)}–{data.schedule.afternoon_out?.slice(0, 5)}
                            </p>
                        )}
                    </CardBody>
                </Card>
            </div>
        </>
    );
}

function Stat({ label, value }) {
    return (
        <div className="rounded-lg border border-border p-2">
            <p className="font-mono text-lg font-semibold">{value}</p>
            <p className="text-xs text-muted">{label}</p>
        </div>
    );
}
