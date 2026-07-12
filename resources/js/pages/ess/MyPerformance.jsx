import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Target, Star, CheckCircle2, ThumbsUp, TrendingUp, PenLine } from 'lucide-react';
import api, { apiError } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Field, Textarea } from '@/components/ui/Field';
import { LoadingBlock, EmptyState } from '@/components/ui/States';
import { formatDate, cn } from '@/lib/utils';

// Written out in full — Tailwind can't see class names built by interpolation.
const scoreColor = (r) => (r >= 4 ? 'text-success' : r >= 3 ? 'text-brand' : r >= 2 ? 'text-amber' : 'text-danger');

/** Read-only 1–5 display. */
function Stars({ rating }) {
    if (rating == null) return <span className="text-xs text-muted">Not rated</span>;
    return (
        <div className="flex items-center gap-0.5" aria-label={`${rating} out of 5`}>
            {[1, 2, 3, 4, 5].map((n) => (
                <Star key={n} className={cn('h-3.5 w-3.5', n <= rating ? 'fill-brand text-brand' : 'text-border')} />
            ))}
        </div>
    );
}

/** 1–5 picker used when scoring yourself. */
function StarPicker({ value, onChange }) {
    return (
        <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
                <button
                    key={n}
                    type="button"
                    onClick={() => onChange(n)}
                    aria-label={`${n} out of 5`}
                    aria-pressed={value === n}
                    className={cn(
                        'flex h-7 w-7 items-center justify-center rounded-md border transition-colors',
                        value != null && n <= value
                            ? 'border-brand bg-brand-soft text-brand'
                            : 'border-border text-muted hover:bg-surface-2'
                    )}
                >
                    <Star className={cn('h-3.5 w-3.5', value != null && n <= value && 'fill-current')} />
                </button>
            ))}
        </div>
    );
}

/** The employee scores themselves against the same criteria, before HR finalises. */
function SelfAppraisalDialog({ review, onClose }) {
    const qc = useQueryClient();
    const [rows, setRows] = useState(() =>
        review.goals.map((g) => ({
            id: g.id,
            title: g.title,
            weight: g.weight,
            self_rating: g.self_rating ?? null,
            self_comments: g.self_comments ?? '',
        }))
    );

    const setRow = (id, patch) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

    const save = useMutation({
        mutationFn: () => api.post(`/performance/my/${review.id}/self-appraisal`, {
            goals: rows.map((r) => ({
                id: r.id,
                self_rating: r.self_rating,
                self_comments: r.self_comments || null,
            })),
        }),
        onSuccess: ({ data }) => {
            toast.success(data.message);
            qc.invalidateQueries({ queryKey: ['performance', 'my'] });
            onClose();
        },
        onError: (err) => toast.error(apiError(err)),
    });

    const complete = rows.every((r) => r.self_rating != null);

    return (
        <Modal
            open={!!review}
            onClose={onClose}
            size="lg"
            title={`Self-appraisal · ${review.period_label}`}
            description="Score yourself honestly against each criterion. Your reviewer sees this alongside their own scores."
            footer={
                <div className="flex w-full items-center justify-between gap-2">
                    <span className="text-sm text-muted">
                        {complete ? 'All criteria scored.' : 'Score every criterion to submit.'}
                    </span>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={onClose}>Cancel</Button>
                        <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!complete}>
                            Submit self-appraisal
                        </Button>
                    </div>
                </div>
            }
        >
            <div className="space-y-3">
                {rows.map((r) => (
                    <div key={r.id} className="rounded-xl border border-border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-medium">
                                {r.title} <span className="text-xs font-normal text-muted">· {r.weight}% weight</span>
                            </p>
                            <StarPicker value={r.self_rating} onChange={(v) => setRow(r.id, { self_rating: v })} />
                        </div>
                        <Textarea
                            rows={2}
                            className="mt-2"
                            value={r.self_comments}
                            onChange={(e) => setRow(r.id, { self_comments: e.target.value })}
                            placeholder="Evidence or context for this score (optional)"
                        />
                    </div>
                ))}
            </div>
        </Modal>
    );
}

function AcknowledgeDialog({ review, onClose }) {
    const qc = useQueryClient();
    const [remarks, setRemarks] = useState('');

    const ack = useMutation({
        mutationFn: () => api.post(`/performance/my/${review.id}/acknowledge`, { employee_remarks: remarks || null }),
        onSuccess: ({ data }) => {
            toast.success(data.message);
            qc.invalidateQueries({ queryKey: ['performance', 'my'] });
            onClose();
        },
        onError: (err) => toast.error(apiError(err)),
    });

    return (
        <Modal
            open={!!review}
            onClose={onClose}
            title="Acknowledge your review"
            description={review && `Confirm you've read your ${review.period_label} appraisal. You can add a comment for the record.`}
            footer={
                <div className="flex w-full justify-end gap-2">
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={() => ack.mutate()} loading={ack.isPending}>
                        <CheckCircle2 className="h-4 w-4" /> Acknowledge
                    </Button>
                </div>
            }
        >
            <Field label="Your remarks (optional)" hint="Shared with your reviewer and kept on your record.">
                <Textarea rows={4} value={remarks} onChange={(e) => setRemarks(e.target.value)}
                    placeholder="Anything you'd like to add about this review" />
            </Field>
        </Modal>
    );
}

function ReviewCard({ review, onAcknowledge, onSelfAppraise }) {
    const r = review;
    // A draft only reaches ESS when a self-appraisal has been asked for; the
    // reviewer's own scores are withheld by the API until it's released.
    const isDraft = r.status === 'draft';
    const awaitingSelf = r.self_appraisal_status === 'pending';

    const statusBadge = isDraft
        ? { tone: 'amber', label: awaitingSelf ? 'Self-appraisal requested' : 'Self-appraisal submitted' }
        : r.status === 'submitted'
            ? { tone: 'amber', label: 'Awaiting your acknowledgement' }
            : { tone: 'success', label: 'Acknowledged' };

    return (
        <Card>
            <CardBody>
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="font-display text-lg font-semibold">{r.period_label}</h3>
                            <Badge tone={statusBadge.tone}>{statusBadge.label}</Badge>
                        </div>
                        <p className="text-sm text-muted">
                            {formatDate(r.period_start)} – {formatDate(r.period_end)}
                            {r.reviewer && ` · reviewed by ${r.reviewer}`}
                        </p>
                    </div>

                    {r.overall_rating != null && (
                        <div className="text-right">
                            <p className={cn('font-display text-3xl font-bold tabular', scoreColor(r.overall_rating))}>
                                {r.overall_rating.toFixed(2)}
                            </p>
                            <p className="text-xs text-muted">{r.rating_label}</p>
                        </div>
                    )}
                </div>

                {/* Criteria — your score and (once released) your reviewer's */}
                <div className="mt-4 space-y-2">
                    {r.goals.map((g) => (
                        <div key={g.id} className="rounded-xl border border-border p-3">
                            <p className="font-medium">
                                {g.title} <span className="text-xs font-normal text-muted">· {g.weight}% weight</span>
                            </p>

                            <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div>
                                    <p className="text-xs text-muted">You rated</p>
                                    <Stars rating={g.self_rating} />
                                    {g.self_comments && <p className="mt-1 text-xs text-muted">{g.self_comments}</p>}
                                </div>

                                {!isDraft && (
                                    <div>
                                        <p className="text-xs text-muted">Your reviewer rated</p>
                                        <Stars rating={g.rating} />
                                        {g.comments && <p className="mt-1 text-xs text-muted">{g.comments}</p>}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                {(r.strengths || r.improvements) && (
                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {r.strengths && (
                            <div className="rounded-xl bg-success/10 p-3">
                                <p className="flex items-center gap-1.5 text-sm font-medium text-success">
                                    <ThumbsUp className="h-4 w-4" /> Strengths
                                </p>
                                <p className="mt-1 text-sm">{r.strengths}</p>
                            </div>
                        )}
                        {r.improvements && (
                            <div className="rounded-xl bg-amber/10 p-3">
                                <p className="flex items-center gap-1.5 text-sm font-medium text-amber">
                                    <TrendingUp className="h-4 w-4" /> Areas to improve
                                </p>
                                <p className="mt-1 text-sm">{r.improvements}</p>
                            </div>
                        )}
                    </div>
                )}

                {r.recommendation_label && (
                    <p className="mt-3 text-sm text-muted">
                        Recommendation: <span className="font-medium text-foreground">{r.recommendation_label}</span>
                    </p>
                )}

                {r.employee_remarks && (
                    <p className="mt-3 rounded-xl border border-border p-3 text-sm italic text-muted">
                        Your remarks: “{r.employee_remarks}”
                    </p>
                )}

                {awaitingSelf && (
                    <div className="mt-4 flex justify-end">
                        <Button onClick={() => onSelfAppraise(r)}>
                            <PenLine className="h-4 w-4" /> Complete self-appraisal
                        </Button>
                    </div>
                )}

                {r.status === 'submitted' && (
                    <div className="mt-4 flex justify-end">
                        <Button onClick={() => onAcknowledge(r)}>
                            <CheckCircle2 className="h-4 w-4" /> Acknowledge review
                        </Button>
                    </div>
                )}
            </CardBody>
        </Card>
    );
}

export default function MyPerformance() {
    const [acking, setAcking] = useState(null);
    const [selfAppraising, setSelfAppraising] = useState(null);

    const { data, isLoading } = useQuery({
        queryKey: ['performance', 'my'],
        queryFn: async () => (await api.get('/performance/my')).data,
    });

    const reviews = data?.reviews ?? [];

    return (
        <>
            <PageHeader
                title="My Performance"
                subtitle="Your appraisals and how you were scored."
            />

            {isLoading ? (
                <LoadingBlock />
            ) : reviews.length === 0 ? (
                <Card>
                    <CardBody>
                        <EmptyState
                            icon={Target}
                            title="No reviews yet"
                            message="When HR completes and releases a performance review, it will appear here for you to read and acknowledge."
                        />
                    </CardBody>
                </Card>
            ) : (
                <div className="space-y-4">
                    {reviews.map((r) => (
                        <ReviewCard key={r.id} review={r} onAcknowledge={setAcking} onSelfAppraise={setSelfAppraising} />
                    ))}
                </div>
            )}

            {acking && <AcknowledgeDialog review={acking} onClose={() => setAcking(null)} />}
            {selfAppraising && <SelfAppraisalDialog review={selfAppraising} onClose={() => setSelfAppraising(null)} />}
        </>
    );
}
