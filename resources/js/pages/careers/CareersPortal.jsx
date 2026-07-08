import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MapPin, Briefcase, ArrowRight, Search } from 'lucide-react';
import { useState } from 'react';
import api from '@/lib/api';
import { useTheme } from '@/context/ThemeContext';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Field';
import { LoadingBlock, EmptyState } from '@/components/ui/States';

const EMPLOYMENT = { full_time: 'Full-time', part_time: 'Part-time', contract: 'Contract', internship: 'Internship' };

export function CareersHeader() {
    const { branding } = useTheme();
    return (
        <header className="sticky top-0 z-20 border-b border-border bg-mist/85 backdrop-blur">
            <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3.5 sm:px-6">
                <Link to="/careers" className="flex items-center gap-2.5">
                    <img src={branding.logo_url || '/logo2.png'} alt="" className="h-9 w-9 rounded-full ring-1 ring-border" />
                    <div className="leading-tight">
                        <p className="font-display font-semibold">{branding.system_name}</p>
                        <p className="text-[11px] text-muted">Careers</p>
                    </div>
                </Link>
            </div>
        </header>
    );
}

export default function CareersPortal() {
    const [q, setQ] = useState('');
    const { data, isLoading } = useQuery({ queryKey: ['careers'], queryFn: async () => (await api.get('/careers')).data });
    const jobs = (data?.data ?? []).filter((j) =>
        !q || `${j.title} ${j.department ?? ''} ${j.location ?? ''}`.toLowerCase().includes(q.toLowerCase()));

    return (
        <div className="min-h-screen bg-mist">
            <CareersHeader />

            {/* Hero */}
            <div className="relative overflow-hidden bg-ink text-white">
                <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-brand/25 blur-3xl" />
                <div className="relative mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
                    <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="font-display text-3xl font-bold sm:text-5xl">
                        Join the team.
                    </motion.h1>
                    <p className="mt-3 max-w-xl text-sidebar-text">Browse our open positions and apply in minutes. We review every application.</p>
                    <div className="relative mt-6 max-w-md">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search roles…" className="pl-9 text-foreground" />
                    </div>
                </div>
            </div>

            {/* Listings */}
            <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
                {isLoading ? <LoadingBlock /> : jobs.length === 0 ? (
                    <EmptyState icon={Briefcase} title="No open positions" message="There are no openings right now. Please check back soon." />
                ) : (
                    <>
                        <p className="mb-4 text-sm text-muted">{jobs.length} open position{jobs.length === 1 ? '' : 's'}</p>
                        <div className="space-y-3">
                            {jobs.map((j, i) => (
                                <motion.div key={j.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                                    <Link to={`/careers/${j.slug}`}
                                        className="card-surface card-hover flex flex-wrap items-center gap-4 p-5">
                                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
                                            <Briefcase className="h-6 w-6" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h3 className="font-display text-lg font-semibold">{j.title}</h3>
                                                <Badge tone="brand">{EMPLOYMENT[j.employment_type]}</Badge>
                                            </div>
                                            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted">
                                                {j.department && <span>{j.department}</span>}
                                                {j.location && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{j.location}</span>}
                                                {j.salary_range && <span className="font-medium text-brand">{j.salary_range}</span>}
                                            </div>
                                        </div>
                                        <ArrowRight className="h-5 w-5 shrink-0 text-muted" />
                                    </Link>
                                </motion.div>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
