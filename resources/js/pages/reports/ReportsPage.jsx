import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
    FileText, Download, RefreshCw, RotateCcw, Users, Clock, CalendarClock, Gift,
    Briefcase, CalendarDays, Megaphone, Wallet, Receipt, FileWarning, Sheet } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { LoadingBlock, EmptyState, Spinner } from '@/components/ui/States';
import { cn } from '@/lib/utils';

// Mirrors the nav icons so a report is recognisable as "the Attendance one".
const MODULE_ICONS = {
    employees: Users,
    attendance: Clock,
    leave: CalendarClock,
    service_credits: Gift,
    recruitment: Briefcase,
    events: CalendarDays,
    announcements: Megaphone,
    payroll: Wallet,
    billing: Receipt,
};

/** Filters the server didn't get a value for are omitted, so "All" means unset. */
function defaultsFor(report) {
    const values = {};
    for (const filter of report.filters) {
        if (filter.default) values[filter.name] = filter.default;
        else if (filter.required) values[filter.name] = filter.options?.[0]?.value ?? '';
        else values[filter.name] = '';
    }
    return values;
}

/** Error bodies come back as a Blob because we asked for one — read the JSON out. */
async function messageFromBlobError(error, fallback) {
    const data = error?.response?.data;
    if (!(data instanceof Blob)) return data?.message ?? fallback;
    try {
        const parsed = JSON.parse(await data.text());
        if (parsed.errors) return Object.values(parsed.errors)[0]?.[0] ?? parsed.message ?? fallback;
        return parsed.message ?? fallback;
    } catch {
        return fallback;
    }
}

function ReportPicker({ reports, activeKey, onSelect }) {
    return (
        <Card>
            <CardBody className="p-2">
                <div className="space-y-0.5">
                    {reports.map((report) => {
                        const Icon = MODULE_ICONS[report.module] ?? FileText;
                        const active = report.key === activeKey;
                        return (
                            <button
                                key={report.key}
                                onClick={() => onSelect(report.key)}
                                className={cn(
                                    'flex w-full items-start gap-3 rounded-xl p-3 text-left transition-colors',
                                    active ? 'bg-brand-soft text-brand' : 'hover:bg-surface-2'
                                )}
                            >
                                <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', !active && 'text-muted')} />
                                <span className="min-w-0">
                                    <span className="block text-sm font-medium">{report.label}</span>
                                    <span className={cn('block text-xs mt-0.5', active ? 'text-brand/70' : 'text-muted')}>
                                        {report.description}
                                    </span>
                                </span>
                            </button>
                        );
                    })}
                </div>
            </CardBody>
        </Card>
    );
}

function FilterBar({ report, values, onChange }) {
    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {report.filters.map((filter) => {
                const blocked = filter.required && !filter.options?.length;

                return (
                    <Field
                        key={filter.name}
                        label={filter.label}
                        hint={blocked ? 'Nothing to select yet — create one first.' : undefined}
                    >
                        {filter.type === 'date' ? (
                            <Input
                                type="date"
                                value={values[filter.name] ?? ''}
                                onChange={(e) => onChange(filter.name, e.target.value)}
                            />
                        ) : (
                            <Select
                                value={values[filter.name] ?? ''}
                                disabled={blocked}
                                placeholder={filter.placeholder}
                                onChange={(e) => onChange(filter.name, e.target.value)}
                            >
                                {!filter.required && <option value="">{filter.placeholder}</option>}
                                {filter.options.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </Select>
                        )}
                    </Field>
                );
            })}
        </div>
    );
}

export default function ReportsPage() {
    const { can } = useAuth();
    const canExport = can('reports', 'export');

    const { data, isLoading } = useQuery({
        queryKey: ['reports', 'meta'],
        queryFn: async () => (await api.get('/reports')).data,
    });
    const reports = useMemo(() => data?.reports ?? [], [data]);

    const [activeKey, setActiveKey] = useState(null);
    const [values, setValues] = useState({});
    const [previewUrl, setPreviewUrl] = useState(null);
    const [rendering, setRendering] = useState(false);
    const [downloading, setDownloading] = useState(false);

    const active = useMemo(
        () => reports.find((r) => r.key === activeKey) ?? reports[0] ?? null,
        [reports, activeKey]
    );

    // Object URLs leak until revoked; keep the live one in a ref so effects and
    // unmount can release the previous document without racing each other.
    const previewRef = useRef(null);
    const setPreview = useCallback((url) => {
        if (previewRef.current) URL.revokeObjectURL(previewRef.current);
        previewRef.current = url;
        setPreviewUrl(url);
    }, []);
    useEffect(() => () => previewRef.current && URL.revokeObjectURL(previewRef.current), []);

    /** A required filter with no options (e.g. no payroll period exists) can't render. */
    const blocked = useMemo(
        () => !!active?.filters.some((f) => f.required && !f.options?.length),
        [active]
    );

    const fetchReport = useCallback(
        async (report, filterValues, { download = false, format = 'pdf' } = {}) => {
            const params = Object.fromEntries(
                Object.entries(filterValues).filter(([, v]) => v !== '' && v != null)
            );
            if (download) params.download = 1;
            if (format !== 'pdf') params.format = format;

            const { data: blob } = await api.get(`/reports/${report.key}`, { params, responseType: 'blob' });
            return blob;
        },
        []
    );

    const generate = useCallback(
        async (report, filterValues) => {
            setRendering(true);
            try {
                const blob = await fetchReport(report, filterValues);
                setPreview(URL.createObjectURL(blob));
            } catch (error) {
                setPreview(null);
                toast.error(await messageFromBlobError(error, 'We couldn’t build that report.'));
            } finally {
                setRendering(false);
            }
        },
        [fetchReport, setPreview]
    );

    // Selecting a report resets its filters to the server-provided defaults and
    // previews it immediately, so the page is never a dead form.
    useEffect(() => {
        if (!active) return;
        const defaults = defaultsFor(active);
        setValues(defaults);
        if (active.filters.some((f) => f.required && !f.options?.length)) {
            setPreview(null);
            return;
        }
        generate(active, defaults);
    }, [active, generate, setPreview]);

    const download = async (format = 'pdf') => {
        setDownloading(format);
        try {
            // Re-requested with ?download=1 rather than reusing the preview blob so
            // the server's `reports.export` check is the one that actually decides.
            const blob = await fetchReport(active, values, { download: true, format });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${active.key.replace('.', '-')}.${format}`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            // Revoking synchronously can cancel a download that hasn't started yet.
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            toast.success(format === 'csv' ? 'Spreadsheet downloaded.' : 'Report downloaded.');
        } catch (error) {
            toast.error(await messageFromBlobError(error, 'We couldn’t download that report.'));
        } finally {
            setDownloading(false);
        }
    };

    if (isLoading) {
        return (
            <>
                <PageHeader title="Reports" subtitle="Preview and export any module as a PDF or spreadsheet." />
                <LoadingBlock />
            </>
        );
    }

    if (!reports.length) {
        return (
            <>
                <PageHeader title="Reports" subtitle="Preview and export any module as a PDF or spreadsheet." />
                <Card>
                    <CardBody>
                        <EmptyState
                            icon={FileWarning}
                            title="No reports available"
                            message="Reports follow your module permissions. Ask an administrator for access to a module to see its report here."
                        />
                    </CardBody>
                </Card>
            </>
        );
    }

    return (
        <>
            <PageHeader
                title="Reports"
                subtitle="Filter any module, preview it, then export as PDF or CSV."
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" onClick={() => setValues(defaultsFor(active))} disabled={rendering}>
                            <RotateCcw className="h-4 w-4" /> Reset filters
                        </Button>
                        <Button variant="outline" onClick={() => generate(active, values)} loading={rendering} disabled={blocked}>
                            {!rendering && <RefreshCw className="h-4 w-4" />} Preview
                        </Button>
                        {canExport && (
                            <>
                                <Button variant="outline" onClick={() => download('csv')}
                                    loading={downloading === 'csv'} disabled={blocked || rendering || !!downloading}>
                                    {downloading !== 'csv' && <Sheet className="h-4 w-4" />} Export CSV
                                </Button>
                                <Button onClick={() => download('pdf')}
                                    loading={downloading === 'pdf'} disabled={blocked || rendering || !!downloading}>
                                    {downloading !== 'pdf' && <Download className="h-4 w-4" />} Download PDF
                                </Button>
                            </>
                        )}
                    </div>
                }
            />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[19rem_minmax(0,1fr)]">
                <div className="lg:sticky lg:top-4 lg:self-start">
                    <ReportPicker reports={reports} activeKey={active?.key} onSelect={setActiveKey} />
                </div>

                <div className="space-y-4">
                    <Card>
                        <CardBody>
                            <h3 className="font-display font-semibold flex items-center gap-2">
                                <FileText className="h-4 w-4 text-brand" /> {active.label}
                            </h3>
                            <p className="mt-1 mb-4 text-sm text-muted">{active.description}</p>
                            <FilterBar
                                report={active}
                                values={values}
                                onChange={(name, value) => setValues((v) => ({ ...v, [name]: value }))}
                            />
                        </CardBody>
                    </Card>

                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                        <Card className="overflow-hidden">
                            <CardBody className="p-0">
                                {blocked ? (
                                    <EmptyState
                                        icon={FileWarning}
                                        title="Nothing to report on yet"
                                        message={`${active.label} needs at least one record before it can be generated.`}
                                    />
                                ) : (
                                    <div className="relative">
                                        {rendering && (
                                            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-surface/80 backdrop-blur-sm">
                                                <Spinner className="h-6 w-6 text-brand" />
                                                <p className="text-sm text-muted">Building your PDF…</p>
                                            </div>
                                        )}
                                        {previewUrl ? (
                                            <iframe
                                                key={previewUrl}
                                                title={`${active.label} preview`}
                                                src={`${previewUrl}#view=FitH`}
                                                className="h-[75vh] min-h-[32rem] w-full bg-surface-2"
                                            />
                                        ) : (
                                            <EmptyState
                                                icon={FileText}
                                                title="No preview yet"
                                                message="Adjust the filters above, then hit Preview."
                                            />
                                        )}
                                    </div>
                                )}
                            </CardBody>
                        </Card>
                    </motion.div>
                </div>
            </div>
        </>
    );
}
