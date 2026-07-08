import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { ArrowLeft, MapPin, Briefcase, CheckCircle2, Upload, FileText, X } from 'lucide-react';
import api, { apiError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { LoadingBlock } from '@/components/ui/States';
import { CareersHeader } from './CareersPortal';

const EMPLOYMENT = { full_time: 'Full-time', part_time: 'Part-time', contract: 'Contract', internship: 'Internship' };

function DocUpload({ req, file, onPick, onClear }) {
    return (
        <div className="rounded-xl border border-border p-3">
            <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                    <p className="text-sm font-medium">
                        {req.name} {req.is_required && <span className="text-danger">*</span>}
                    </p>
                    {req.description && <p className="text-xs text-muted">{req.description}</p>}
                </div>
                {!file ? (
                    <label className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-2">
                        <Upload className="h-4 w-4" /> Upload
                        <input type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                            onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
                    </label>
                ) : (
                    <button type="button" onClick={onClear} className="text-muted hover:text-danger"><X className="h-4 w-4" /></button>
                )}
            </div>
            {file && (
                <div className="mt-2 flex items-center gap-2 rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand">
                    <FileText className="h-4 w-4 shrink-0" />
                    <span className="truncate">{file.name}</span>
                </div>
            )}
        </div>
    );
}

export default function CareersJob() {
    const { slug } = useParams();
    const navigate = useNavigate();
    const [form, setForm] = useState({ first_name: '', last_name: '', email: '', phone: '', cover_letter: '' });
    const [files, setFiles] = useState({}); // requirementId -> File
    const [submitted, setSubmitted] = useState(false);

    const { data, isLoading, isError } = useQuery({
        queryKey: ['careers', slug],
        queryFn: async () => (await api.get(`/careers/${slug}`)).data,
        retry: false,
    });
    const job = data?.opening;

    const apply = useMutation({
        mutationFn: () => {
            const fd = new FormData();
            Object.entries(form).forEach(([k, v]) => fd.append(k, v ?? ''));
            Object.entries(files).forEach(([reqId, file]) => { if (file) fd.append(`documents[${reqId}]`, file); });
            return api.post(`/careers/${slug}/apply`, fd);
        },
        onSuccess: ({ data }) => { toast.success(data.message); setSubmitted(true); window.scrollTo({ top: 0, behavior: 'smooth' }); },
        onError: (err) => toast.error(apiError(err)),
    });

    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    function submit(e) {
        e.preventDefault();
        const missing = (job.requirements ?? []).filter((r) => r.is_required && !files[r.id]);
        if (missing.length) { toast.error(`Please attach: ${missing.map((r) => r.name).join(', ')}`); return; }
        apply.mutate();
    }

    if (isLoading) return <div className="min-h-screen bg-mist"><CareersHeader /><div className="mx-auto max-w-3xl p-6"><LoadingBlock /></div></div>;
    if (isError || !job) {
        return (
            <div className="min-h-screen bg-mist">
                <CareersHeader />
                <div className="mx-auto max-w-3xl px-4 py-16 text-center">
                    <h1 className="font-display text-2xl font-semibold">Position not found</h1>
                    <p className="mt-2 text-muted">This opening may have closed.</p>
                    <Link to="/careers" className="mt-4 inline-block text-brand hover:underline">← Back to all jobs</Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-mist">
            <CareersHeader />
            <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
                <Link to="/careers" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
                    <ArrowLeft className="h-4 w-4" /> All positions
                </Link>

                {submitted ? (
                    <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="card-surface p-8 text-center sm:p-12">
                        <CheckCircle2 className="mx-auto h-14 w-14 text-success" />
                        <h1 className="mt-4 font-display text-2xl font-bold">Application submitted!</h1>
                        <p className="mt-2 text-muted">Thanks for applying to <b>{job.title}</b>. Our HR team will review your application and reach out via email.</p>
                        <Link to="/careers"><Button className="mt-6">Browse more jobs</Button></Link>
                    </motion.div>
                ) : (
                    <>
                        {/* Job header */}
                        <div className="card-surface p-6">
                            <div className="flex flex-wrap items-center gap-2">
                                <h1 className="font-display text-2xl font-bold">{job.title}</h1>
                                <Badge tone="brand">{EMPLOYMENT[job.employment_type]}</Badge>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted">
                                {job.department && <span className="flex items-center gap-1"><Briefcase className="h-4 w-4" />{job.department}</span>}
                                {job.location && <span className="flex items-center gap-1"><MapPin className="h-4 w-4" />{job.location}</span>}
                                {job.openings_count > 1 && <span>{job.openings_count} openings</span>}
                            </div>
                            {job.salary_range && <p className="mt-3 text-lg font-semibold text-brand">{job.salary_range}</p>}
                            {job.description && <p className="mt-4 whitespace-pre-line text-sm leading-relaxed">{job.description}</p>}
                        </div>

                        {/* Apply form */}
                        <form onSubmit={submit} className="card-surface mt-6 p-6">
                            <h2 className="font-display text-lg font-semibold">Apply for this position</h2>
                            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <Field label="First name"><Input value={form.first_name} onChange={set('first_name')} required /></Field>
                                <Field label="Last name"><Input value={form.last_name} onChange={set('last_name')} required /></Field>
                                <Field label="Email"><Input type="email" value={form.email} onChange={set('email')} required /></Field>
                                <Field label="Phone"><Input value={form.phone} onChange={set('phone')} placeholder="0917…" /></Field>
                            </div>
                            <Field label="Cover letter (optional)" className="mt-4">
                                <Textarea rows={4} value={form.cover_letter} onChange={set('cover_letter')} placeholder="Tell us why you're a great fit…" />
                            </Field>

                            {(job.requirements ?? []).length > 0 && (
                                <div className="mt-5">
                                    <p className="mb-2 text-sm font-medium">Required documents</p>
                                    <div className="space-y-2">
                                        {job.requirements.map((r) => (
                                            <DocUpload key={r.id} req={r} file={files[r.id]}
                                                onPick={(file) => setFiles((f) => ({ ...f, [r.id]: file }))}
                                                onClear={() => setFiles((f) => { const n = { ...f }; delete n[r.id]; return n; })} />
                                        ))}
                                    </div>
                                    <p className="mt-2 text-xs text-muted">Accepted: PDF, DOC, DOCX, JPG, PNG · max 5MB each. <span className="text-danger">*</span> required.</p>
                                </div>
                            )}

                            <Button type="submit" size="lg" loading={apply.isPending} className="mt-6 w-full">Submit application</Button>
                        </form>
                    </>
                )}
            </div>
        </div>
    );
}
