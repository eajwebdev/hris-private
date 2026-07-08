import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Upload, Trash2, Palette, Building2 } from 'lucide-react';
import api, { apiError } from '@/lib/api';
import { useTheme, THEME_PRESETS } from '@/context/ThemeContext';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Field, Input } from '@/components/ui/Field';
import { LoadingBlock } from '@/components/ui/States';

export default function SystemSettings() {
    const { applyBranding, setTheme, setMode, reloadBranding } = useTheme();
    const [form, setForm] = useState({ system_name: '', system_tagline: '', theme_brand: '#d61b5d', theme_amber: '#e39a3b', theme_mode: 'light' });
    const [logo, setLogo] = useState(null);
    const [logoPreview, setLogoPreview] = useState(null);

    const { data, isLoading } = useQuery({ queryKey: ['settings'], queryFn: async () => (await api.get('/settings')).data });

    useEffect(() => {
        if (data) {
            setForm({
                system_name: data.system_name ?? '', system_tagline: data.system_tagline ?? '',
                theme_brand: data.theme_brand ?? '#d61b5d', theme_amber: data.theme_amber ?? '#e39a3b',
                theme_mode: data.theme_mode ?? 'light',
            });
            setLogoPreview(data.logo_url);
        }
    }, [data]);

    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    // Live preview as you edit.
    useEffect(() => { applyBranding({ system_name: form.system_name, system_tagline: form.system_tagline }); }, [form.system_name, form.system_tagline]);
    useEffect(() => { setTheme({ brand: form.theme_brand, amber: form.theme_amber }); }, [form.theme_brand, form.theme_amber]);

    function pickLogo(file) {
        setLogo(file);
        setLogoPreview(file ? URL.createObjectURL(file) : null);
    }

    const save = useMutation({
        mutationFn: () => {
            const fd = new FormData();
            Object.entries(form).forEach(([k, v]) => fd.append(k, v));
            if (logo) fd.append('logo', logo);
            return api.post('/settings', fd);
        },
        onSuccess: ({ data: res }) => {
            toast.success('Settings saved — applied across the whole system.');
            applyBranding({ system_name: res.system_name, system_tagline: res.system_tagline, logo_url: res.logo_url });
            if (res.mode) setMode(res.mode);
            reloadBranding();
        },
        onError: (e) => toast.error(apiError(e)),
    });

    const removeLogo = useMutation({
        mutationFn: () => {
            const fd = new FormData();
            fd.append('remove_logo', '1');
            return api.post('/settings', fd);
        },
        onSuccess: () => { toast.success('Logo removed.'); setLogo(null); setLogoPreview(null); reloadBranding(); },
    });

    if (isLoading) return <LoadingBlock />;

    return (
        <>
            <PageHeader title="System Settings" subtitle="Set the system name, logo and theme. Changes apply everywhere instantly." />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Identity */}
                <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="h-4 w-4" /> Identity</CardTitle></CardHeader>
                    <CardBody className="space-y-4">
                        <Field label="System name" hint="Shown in the sidebar, login screen and browser tab.">
                            <Input value={form.system_name} onChange={set('system_name')} placeholder="EAJ HRIS" />
                        </Field>
                        <Field label="Tagline">
                            <Input value={form.system_tagline} onChange={set('system_tagline')} placeholder="Human Resources" />
                        </Field>

                        <div>
                            <p className="text-sm font-medium mb-1.5">Logo</p>
                            <div className="flex items-center gap-4">
                                <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-ink overflow-hidden">
                                    {logoPreview ? (
                                        <img src={logoPreview} alt="Logo" className="h-full w-full object-contain" />
                                    ) : (
                                        <span className="font-display text-2xl font-bold text-brand-ink">{form.system_name?.[0] ?? 'E'}</span>
                                    )}
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm hover:bg-surface-2">
                                        <Upload className="h-4 w-4" /> Upload logo
                                        <input type="file" accept="image/*" className="hidden" onChange={(e) => pickLogo(e.target.files?.[0] ?? null)} />
                                    </label>
                                    {logoPreview && (
                                        <IconButton label="Remove logo" icon={Trash2} tone="danger" side="bottom" onClick={() => removeLogo.mutate()} />
                                    )}
                                </div>
                            </div>
                            <p className="mt-2 text-xs text-muted">PNG or SVG, square, max 2MB.</p>
                        </div>
                    </CardBody>
                </Card>

                {/* Theme */}
                <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><Palette className="h-4 w-4" /> Theme</CardTitle></CardHeader>
                    <CardBody className="space-y-4">
                        <div>
                            <p className="text-sm font-medium mb-1.5">Presets</p>
                            <div className="flex gap-2">
                                {Object.entries(THEME_PRESETS).map(([name, vars]) => (
                                    <button key={name} onClick={() => setForm((f) => ({ ...f, theme_brand: vars.brand, theme_amber: vars.amber }))}
                                        className="flex-1 rounded-xl border border-border p-3 text-center text-sm hover:border-brand">
                                        <div className="mx-auto mb-1.5 flex gap-1 justify-center">
                                            <span className="h-4 w-4 rounded-full" style={{ backgroundColor: vars.brand }} />
                                            <span className="h-4 w-4 rounded-full" style={{ backgroundColor: vars.amber }} />
                                        </div>
                                        {name}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Brand color">
                                <div className="flex items-center gap-2">
                                    <input type="color" value={form.theme_brand} onChange={set('theme_brand')} className="h-10 w-12 rounded-lg border border-border" />
                                    <Input value={form.theme_brand} onChange={set('theme_brand')} className="font-mono" />
                                </div>
                            </Field>
                            <Field label="Accent color">
                                <div className="flex items-center gap-2">
                                    <input type="color" value={form.theme_amber} onChange={set('theme_amber')} className="h-10 w-12 rounded-lg border border-border" />
                                    <Input value={form.theme_amber} onChange={set('theme_amber')} className="font-mono" />
                                </div>
                            </Field>
                        </div>
                        <Field label="Base mode">
                            <div className="flex gap-2">
                                {['light', 'dark'].map((m) => (
                                    <button key={m} onClick={() => { setForm((f) => ({ ...f, theme_mode: m })); setMode(m); }}
                                        className={`flex-1 rounded-xl border p-2.5 text-sm capitalize ${form.theme_mode === m ? 'border-brand bg-brand-soft text-brand' : 'border-border'}`}>
                                        {m}
                                    </button>
                                ))}
                            </div>
                        </Field>
                    </CardBody>
                </Card>
            </div>

            <div className="mt-4 flex justify-end">
                <Button onClick={() => save.mutate()} loading={save.isPending} size="lg">Save settings</Button>
            </div>
        </>
    );
}
