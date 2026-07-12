import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { ScrollText, Search } from 'lucide-react';
import api from '@/lib/api';
import { useServerPagination } from '@/hooks/usePagination';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { Input, Select } from '@/components/ui/Field';
import { Table, THead, TH, TBody, TR, TD } from '@/components/ui/Table';
import { Pagination } from '@/components/ui/Pagination';
import { LoadingBlock, EmptyState } from '@/components/ui/States';
import { pageMeta } from '@/lib/utils';

// Destructive verbs read red, approvals green, the rest neutral.
const ACTION_TONE = {
    created: 'success', granted: 'success', approved: 'success', paid: 'success',
    updated: 'brand', corrected: 'amber', submitted: 'amber', acknowledged: 'brand', finalized: 'brand',
    deleted: 'danger', rejected: 'danger',
};

/** Field-level diff, rendered old → new. */
function Changes({ changes }) {
    const entries = Object.entries(changes ?? {});
    if (entries.length === 0) return <span className="text-muted">—</span>;

    return (
        <div className="space-y-0.5">
            {entries.slice(0, 4).map(([field, { old, new: next }]) => (
                <p key={field} className="text-xs">
                    <span className="text-muted">{field.replace(/_/g, ' ')}: </span>
                    <span className="text-muted line-through">{String(old ?? '—')}</span>
                    <span className="mx-1 text-muted">→</span>
                    <span className="font-medium">{String(next ?? '—')}</span>
                </p>
            ))}
            {entries.length > 4 && <p className="text-xs text-muted">+{entries.length - 4} more</p>}
        </div>
    );
}

const timestamp = (iso) =>
    new Date(iso).toLocaleString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    });

export default function AuditLogPage() {
    const [filters, setFilters] = useState({ module: '', action: '', search: '', from: '', to: '' });
    const { page, setPage } = useServerPagination(JSON.stringify(filters));

    const { data: meta } = useQuery({
        queryKey: ['audit', 'meta'],
        queryFn: async () => (await api.get('/audit-logs/meta')).data,
        staleTime: Infinity,
    });

    const { data, isLoading } = useQuery({
        queryKey: ['audit', filters, page],
        queryFn: async () =>
            (await api.get('/audit-logs', {
                params: {
                    ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
                    page,
                    per_page: 25,
                },
            })).data,
        placeholderData: keepPreviousData,
    });

    const rows = data?.data ?? [];
    const pmeta = pageMeta(data, 25);
    const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));

    return (
        <>
            <PageHeader title="Audit Log" subtitle="Who changed what, and when. Entries are append-only and cannot be edited." />

            <Card>
                <CardBody className="p-0">
                    <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
                        <div className="relative min-w-[200px] flex-1">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                            <Input
                                className="pl-9"
                                placeholder="Search description, record or user…"
                                value={filters.search}
                                onChange={set('search')}
                            />
                        </div>
                        <Select value={filters.module} onChange={set('module')} className="w-44">
                            <option value="">All modules</option>
                            {(meta?.modules ?? []).map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </Select>
                        <Select value={filters.action} onChange={set('action')} className="w-40">
                            <option value="">All actions</option>
                            {(meta?.actions ?? []).map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                        </Select>
                        <Input type="date" value={filters.from} onChange={set('from')} className="w-40" aria-label="From date" />
                        <Input type="date" value={filters.to} onChange={set('to')} className="w-40" aria-label="To date" />
                    </div>

                    {isLoading ? <LoadingBlock /> : rows.length === 0 ? (
                        <EmptyState
                            icon={ScrollText}
                            title="Nothing recorded yet"
                            message="Changes to employees, attendance, credits, payroll, users and settings will be listed here as they happen."
                        />
                    ) : (
                        <>
                            <Table>
                                <THead>
                                    <TH>When</TH>
                                    <TH>Who</TH>
                                    <TH>Action</TH>
                                    <TH>What changed</TH>
                                    <TH className="hidden xl:table-cell">Details</TH>
                                </THead>
                                <TBody>
                                    {rows.map((l) => (
                                        <TR key={l.id}>
                                            <TD className="whitespace-nowrap text-muted">{timestamp(l.created_at)}</TD>
                                            <TD>
                                                <div className="flex items-center gap-2.5 min-w-0">
                                                    <Avatar name={l.user} size="sm" />
                                                    <div className="min-w-0">
                                                        <p className="truncate font-medium">{l.user}</p>
                                                        {l.branch && <p className="truncate text-xs text-muted">{l.branch}</p>}
                                                    </div>
                                                </div>
                                            </TD>
                                            <TD>
                                                <Badge tone={ACTION_TONE[l.action] ?? 'neutral'} className="capitalize">{l.action}</Badge>
                                                <p className="mt-0.5 text-xs text-muted">{l.module_label}</p>
                                            </TD>
                                            <TD className="max-w-[380px]">
                                                <p className="font-medium">{l.description}</p>
                                                {l.subject_label && (
                                                    <p className="truncate text-xs text-muted">{l.subject_type} · {l.subject_label}</p>
                                                )}
                                            </TD>
                                            <TD className="hidden xl:table-cell max-w-[280px]"><Changes changes={l.changes} /></TD>
                                        </TR>
                                    ))}
                                </TBody>
                            </Table>
                            <Pagination page={pmeta.page} lastPage={pmeta.lastPage} total={pmeta.total} perPage={pmeta.perPage} onPage={setPage} />
                        </>
                    )}
                </CardBody>
            </Card>
        </>
    );
}
