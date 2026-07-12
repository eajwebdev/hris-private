import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    ResponsiveContainer, ComposedChart, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
    Line, XAxis, YAxis, CartesianGrid, Legend, Tooltip as RTooltip,
} from 'recharts';
import { Users, UserPlus, UserMinus, TrendingDown, Clock, CalendarClock, Target, Hourglass } from 'lucide-react';
import api from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Select } from '@/components/ui/Field';
import { LoadingBlock, EmptyState } from '@/components/ui/States';
import { peso, cn } from '@/lib/utils';

const tooltipStyle = {
    borderRadius: 12,
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--ink-text)',
};

// Categorical series, drawn from the theme tokens so both themes stay legible.
const SERIES = ['var(--brand)', 'var(--chart-late)', 'var(--success)', 'var(--muted)', 'var(--danger)'];

const axis = { tick: { fontSize: 12, fill: 'var(--muted)' }, axisLine: false, tickLine: false };

/** Card wrapper that swaps in a loading/empty state so every panel behaves the same. */
function ChartCard({ title, action, loading, empty, emptyMessage, children, className }) {
    return (
        <Card className={className}>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
                {action}
            </CardHeader>
            <CardBody>
                {loading ? (
                    <LoadingBlock />
                ) : empty ? (
                    <EmptyState icon={Hourglass} title="Not enough data yet" message={emptyMessage} />
                ) : (
                    children
                )}
            </CardBody>
        </Card>
    );
}

export default function AnalyticsPage() {
    const [months, setMonths] = useState(12);

    const { data: a, isLoading } = useQuery({
        queryKey: ['analytics', months],
        queryFn: async () => (await api.get('/analytics', { params: { months } })).data,
    });

    const k = a?.kpis;
    const cards = [
        { label: 'Headcount', value: k?.headcount ?? '—', icon: Users, tone: 'brand', detail: 'Active employees' },
        { label: 'Hires', value: k?.hires ?? '—', icon: UserPlus, tone: 'success', detail: `Last ${months} months` },
        { label: 'Exits', value: k?.exits ?? '—', icon: UserMinus, tone: 'danger', detail: k ? `Net ${k.net_change >= 0 ? '+' : ''}${k.net_change}` : null },
        { label: 'Turnover rate', value: k ? `${k.turnover_rate}%` : '—', icon: TrendingDown, tone: 'amber', detail: 'Exits ÷ avg headcount' },
        { label: 'Punctuality', value: k?.punctuality_rate != null ? `${k.punctuality_rate}%` : '—', icon: Clock, tone: 'success', detail: 'On time, this month' },
        { label: 'Avg tenure', value: k ? `${k.avg_tenure_years} yrs` : '—', icon: CalendarClock, tone: 'brand', detail: 'Across active staff' },
        { label: 'Open reviews', value: k?.pending_reviews ?? '—', icon: Target, tone: 'amber', detail: 'Draft or awaiting sign-off' },
    ];

    const empty = (arr) => !arr || arr.length === 0 || arr.every((r) => !r.value);

    return (
        <>
            <PageHeader
                title="Analytics"
                subtitle="Workforce trends across the branches you can see."
                actions={
                    <Select value={String(months)} onChange={(e) => setMonths(Number(e.target.value))} className="w-40">
                        <option value="6">Last 6 months</option>
                        <option value="12">Last 12 months</option>
                        <option value="24">Last 24 months</option>
                    </Select>
                }
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {cards.map((c, i) => <StatCard key={c.label} index={i} {...c} />)}
            </div>

            {/* Headcount movement — running headcount against hires/exits. */}
            <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
                <ChartCard title="Headcount movement" loading={isLoading} className="lg:col-span-2">
                    <ResponsiveContainer width="100%" height={280}>
                        <ComposedChart data={a?.headcount_trend ?? []}>
                            <defs>
                                <linearGradient id="gHead" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.28} />
                                    <stop offset="100%" stopColor="var(--brand)" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                            <XAxis dataKey="month" {...axis} />
                            <YAxis {...axis} allowDecimals={false} width={34} />
                            <RTooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--surface-2)' }} />
                            <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
                            <Area type="monotone" dataKey="headcount" name="Headcount" stroke="var(--brand)" strokeWidth={2} fill="url(#gHead)" />
                            <Bar dataKey="hires" name="Hires" fill="var(--success)" radius={[3, 3, 0, 0]} maxBarSize={14} />
                            <Bar dataKey="exits" name="Exits" fill="var(--danger)" radius={[3, 3, 0, 0]} maxBarSize={14} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Headcount by branch" loading={isLoading} empty={empty(a?.headcount_by_branch)}
                    emptyMessage="No active employees to chart.">
                    <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={a?.headcount_by_branch ?? []} layout="vertical" margin={{ left: 8 }} barCategoryGap="25%">
                            <XAxis type="number" hide allowDecimals={false} />
                            <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                            <RTooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--surface-2)' }} />
                            <Bar dataKey="value" name="Employees" fill="var(--brand)" radius={[0, 4, 4, 0]} maxBarSize={18} />
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>
            </div>

            {/* Punctuality + tenure */}
            <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
                <ChartCard title="On-time rate" loading={isLoading} className="lg:col-span-2"
                    empty={empty(a?.punctuality_trend?.map((r) => ({ value: r.on_time_rate })))}
                    emptyMessage="No attendance has been logged in this window.">
                    <ResponsiveContainer width="100%" height={260}>
                        <AreaChart data={a?.punctuality_trend ?? []}>
                            <defs>
                                <linearGradient id="gOnTime" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="var(--success)" stopOpacity={0.28} />
                                    <stop offset="100%" stopColor="var(--success)" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                            <XAxis dataKey="month" {...axis} />
                            <YAxis {...axis} width={40} domain={[0, 100]} unit="%" />
                            <RTooltip contentStyle={tooltipStyle} formatter={(v) => [`${v}%`, 'On time']} />
                            <Area type="monotone" dataKey="on_time_rate" name="On time" stroke="var(--success)" strokeWidth={2} fill="url(#gOnTime)" dot={false} activeDot={{ r: 4 }} />
                        </AreaChart>
                    </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Tenure" loading={isLoading} empty={empty(a?.tenure)}
                    emptyMessage="No hire dates recorded yet.">
                    <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={a?.tenure ?? []}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                            <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted)' }} axisLine={false} tickLine={false} interval={0} />
                            <YAxis {...axis} allowDecimals={false} width={28} />
                            <RTooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--surface-2)' }} />
                            <Bar dataKey="value" name="Employees" fill="var(--brand)" radius={[4, 4, 0, 0]} maxBarSize={38} />
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>
            </div>

            {/* Demographics */}
            <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
                {[
                    { title: 'Gender', data: a?.demographics?.gender },
                    { title: 'Employment type', data: a?.demographics?.employment_type },
                    { title: 'Employment status', data: a?.demographics?.status },
                ].map(({ title, data }) => (
                    <ChartCard key={title} title={title} loading={isLoading} empty={empty(data)}
                        emptyMessage="No employees to break down.">
                        <ResponsiveContainer width="100%" height={230}>
                            <PieChart>
                                <Pie data={data ?? []} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={2} stroke="var(--surface)" strokeWidth={2}>
                                    {(data ?? []).map((_, i) => <Cell key={i} fill={SERIES[i % SERIES.length]} />)}
                                </Pie>
                                <RTooltip contentStyle={tooltipStyle} />
                                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                            </PieChart>
                        </ResponsiveContainer>
                    </ChartCard>
                ))}
            </div>

            {/* Leave + performance */}
            <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ChartCard title="Leave days taken by type" loading={isLoading} empty={empty(a?.leave_by_type)}
                    emptyMessage="No approved leave in this window.">
                    <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={a?.leave_by_type ?? []} layout="vertical" margin={{ left: 8 }}>
                            <XAxis type="number" hide />
                            <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                            <RTooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--surface-2)' }}
                                formatter={(v, _n, p) => [`${v} day(s) · ${p.payload.requests} request(s)`, 'Taken']} />
                            <Bar dataKey="value" name="Days" fill="var(--chart-late)" radius={[0, 4, 4, 0]} maxBarSize={18} />
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Performance rating spread" loading={isLoading} empty={empty(a?.performance_distribution)}
                    emptyMessage="No reviews have been submitted yet.">
                    <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={a?.performance_distribution ?? []} layout="vertical" margin={{ left: 8 }}>
                            <XAxis type="number" hide allowDecimals={false} />
                            <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                            <RTooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--surface-2)' }} />
                            <Bar dataKey="value" name="Employees" radius={[0, 4, 4, 0]} maxBarSize={18}>
                                {(a?.performance_distribution ?? []).map((_, i) => (
                                    // Low scores read red, high scores read green.
                                    <Cell key={i} fill={['var(--danger)', 'var(--chart-late)', 'var(--muted)', 'var(--brand)', 'var(--success)'][i]} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>
            </div>

            {/* Leaderboard — ranked on rate so a big branch doesn't out-rank a small one by volume */}
            <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
                {[
                    { title: 'Branch leaderboard', rows: a?.leaderboard?.branches },
                    { title: 'Department leaderboard', rows: a?.leaderboard?.departments },
                ].map(({ title, rows }) => (
                    <ChartCard key={title} title={title} loading={isLoading}
                        action={a?.leaderboard?.period && <span className="text-xs text-muted">{a.leaderboard.period} · on-time rate</span>}
                        empty={!rows || rows.length === 0}
                        emptyMessage="No attendance logged this month.">
                        <div className="space-y-2">
                            {(rows ?? []).map((r, i) => (
                                <div key={r.name} className="flex items-center gap-3">
                                    <span className={cn(
                                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold tabular',
                                        i === 0 ? 'bg-brand text-white' : 'bg-surface-2 text-muted'
                                    )}>
                                        {i + 1}
                                    </span>

                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-baseline justify-between gap-2">
                                            <p className="truncate text-sm font-medium">{r.name}</p>
                                            <span className="tabular text-sm font-semibold">{r.on_time_rate}%</span>
                                        </div>
                                        {/* Bar doubles as the ranking cue */}
                                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                                            <div className="h-full rounded-full bg-brand" style={{ width: `${r.on_time_rate}%` }} />
                                        </div>
                                        <p className="mt-0.5 text-[11px] text-muted">
                                            {r.headcount} staff · {r.days} day(s) logged
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ChartCard>
                ))}
            </div>

            {/* Payroll cost */}
            <div className="mt-6">
                <ChartCard title="Payroll cost by period" loading={isLoading} empty={empty(a?.payroll_trend?.map((r) => ({ value: r.gross })))}
                    emptyMessage="No payroll has been generated in this window.">
                    <ResponsiveContainer width="100%" height={280}>
                        <ComposedChart data={a?.payroll_trend ?? []}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                            <XAxis dataKey="label" {...axis} />
                            <YAxis {...axis} width={72} tickFormatter={(v) => `₱${(v / 1000).toFixed(0)}k`} />
                            <RTooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--surface-2)' }}
                                formatter={(v, n) => [peso(v), n]} />
                            <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                            <Bar dataKey="gross" name="Gross" fill="var(--brand)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                            <Bar dataKey="net" name="Net" fill="var(--success)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                            <Line type="monotone" dataKey="deductions" name="Deductions" stroke="var(--chart-late)" strokeWidth={2} dot={false} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </ChartCard>
            </div>
        </>
    );
}
