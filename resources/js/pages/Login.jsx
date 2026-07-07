import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { apiError } from '@/lib/api';

export default function Login() {
    const { login } = useAuth();
    const { branding } = useTheme();
    const navigate = useNavigate();
    const Logo = branding.logo_url
        ? <img src={branding.logo_url} alt={branding.system_name} className="h-11 w-11 rounded-xl object-contain" />
        : <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand text-brand-ink font-display font-bold text-lg">{branding.system_name?.[0] ?? 'E'}</div>;
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    async function submit(e) {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            const user = await login(email, password);
            toast.success(`Welcome back, ${user.name.split(' ')[0]}`);
            navigate(user.is_super_admin || Object.values(user.permissions || {}).some((m) => Object.values(m).some(Boolean)) ? '/app' : '/ess');
        } catch (err) {
            setError(apiError(err, 'These credentials don’t match our records.'));
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen grid lg:grid-cols-2">
            {/* Brand panel */}
            <div className="relative hidden lg:flex flex-col justify-between bg-ink p-12 text-white overflow-hidden">
                <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand/30 blur-3xl" />
                <div className="absolute -left-16 bottom-0 h-72 w-72 rounded-full bg-amber/20 blur-3xl" />
                <div className="relative flex items-center gap-3">
                    {Logo}
                    <span className="font-display text-xl font-semibold">{branding.system_name}</span>
                </div>
                <div className="relative">
                    <h1 className="font-display text-4xl font-bold leading-tight">
                        Presence & time,<br />beautifully managed.
                    </h1>
                    <p className="mt-4 max-w-md text-sidebar-text">
                        Multi-branch HR, face-verified attendance, leave, recruitment and payroll — one calm operational home.
                    </p>
                </div>
                <p className="relative text-xs text-sidebar-text">© {new Date().getFullYear()} EAJ Systems</p>
            </div>

            {/* Form panel */}
            <div className="flex items-center justify-center p-6 sm:p-12">
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full max-w-sm"
                >
                    <div className="lg:hidden mb-8 flex items-center gap-3">
                        {Logo}
                        <span className="font-display text-xl font-semibold">{branding.system_name}</span>
                    </div>
                    <h2 className="font-display text-2xl font-semibold">Sign in</h2>
                    <p className="text-sm text-muted mt-1">Welcome back. Enter your credentials to continue.</p>

                    <form onSubmit={submit} className="mt-8 space-y-4">
                        {error && (
                            <div className="rounded-xl border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
                                {error}
                            </div>
                        )}
                        <Field label="Email">
                            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@company.com" autoComplete="email" required autoFocus />
                        </Field>
                        <Field label="Password">
                            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••" autoComplete="current-password" required />
                        </Field>
                        <Button type="submit" size="lg" loading={loading} className="w-full">
                            Sign in
                        </Button>
                    </form>
                </motion.div>
            </div>
        </div>
    );
}
