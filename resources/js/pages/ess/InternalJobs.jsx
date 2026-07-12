import { useQuery } from '@tanstack/react-query';
import { Briefcase, MapPin, Building2, ArrowUpRight, Clock, Banknote } from 'lucide-react';
import api from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { LoadingBlock, EmptyState } from '@/components/ui/States';
import { formatDate } from '@/lib/utils';

/**
 * Internal job board. Applications go through the public careers page, which
 * already carries each opening's required-document checklist.
 */
export default function InternalJobs() {
    const { data, isLoading } = useQuery({
        queryKey: ['profile', 'jobs'],
        queryFn: async () => (await api.get('/profile/jobs')).data,
    });

    const jobs = data?.data ?? [];

    return (
        <>
            <PageHeader
                title="Internal Jobs"
                subtitle="Open roles across the company. Apply through the careers page."
            />

            {isLoading ? (
                <LoadingBlock />
            ) : jobs.length === 0 ? (
                <Card>
                    <CardBody>
                        <EmptyState
                            icon={Briefcase}
                            title="No open positions"
                            message="There are no published openings right now. Check back later."
                        />
                    </CardBody>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {jobs.map((j) => (
                        <Card key={j.id} className="card-hover flex h-full flex-col">
                            <CardBody className="flex flex-1 flex-col">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <h3 className="font-display text-lg font-semibold">{j.title}</h3>
                                        <p className="text-sm text-muted">{j.department ?? 'General'}</p>
                                    </div>
                                    {j.is_own_branch && <Badge tone="brand">Your branch</Badge>}
                                </div>

                                <div className="mt-3 space-y-1.5 text-sm text-muted">
                                    {j.branch && (
                                        <p className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /> {j.branch}</p>
                                    )}
                                    {j.location && (
                                        <p className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> {j.location}</p>
                                    )}
                                    {j.employment_type && (
                                        <p className="flex items-center gap-1.5 capitalize">
                                            <Clock className="h-3.5 w-3.5" /> {j.employment_type.replace('_', ' ')}
                                        </p>
                                    )}
                                    {j.salary_range && (
                                        <p className="flex items-center gap-1.5"><Banknote className="h-3.5 w-3.5" /> {j.salary_range}</p>
                                    )}
                                </div>

                                <div className="mt-auto flex items-center justify-between gap-3 pt-4">
                                    <p className="text-xs text-muted">
                                        {j.openings_count > 1 && `${j.openings_count} openings · `}
                                        Posted {formatDate(j.published_at)}
                                    </p>
                                    <a href={`/careers/${j.slug}`} target="_blank" rel="noreferrer">
                                        <Button variant="outline" size="sm">
                                            View &amp; apply <ArrowUpRight className="h-3.5 w-3.5" />
                                        </Button>
                                    </a>
                                </div>
                            </CardBody>
                        </Card>
                    ))}
                </div>
            )}
        </>
    );
}
