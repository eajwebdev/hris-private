import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { apiError } from '@/lib/api';

/** Official multi-color Google "G". */
function GoogleIcon(props) {
    return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden {...props}>
            <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.46H12v4.65h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.16 3.57-8.81z" />
            <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.93-2.91l-3.87-3c-1.07.72-2.44 1.14-4.06 1.14-3.12 0-5.77-2.11-6.71-4.95H1.29v3.1A12 12 0 0 0 12 24z" />
            <path fill="#FBBC05" d="M5.29 14.28A7.22 7.22 0 0 1 4.91 12c0-.79.14-1.56.38-2.28v-3.1H1.29a12 12 0 0 0 0 10.76l4-3.1z" />
            <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.6 4.58 1.79l3.44-3.44A11.97 11.97 0 0 0 12 0 12 12 0 0 0 1.29 6.62l4 3.1C6.23 6.88 8.88 4.77 12 4.77z" />
        </svg>
    );
}

/** Where to land after sign-in: admin app if any module permission, else ESS. */
function homeFor(user) {
    const hasAdmin = user.is_super_admin
        || Object.values(user.permissions || {}).some((m) => Object.values(m).some(Boolean));
    return hasAdmin ? '/app' : '/ess';
}

export default function Login() {
    const { login, loginWithToken } = useAuth();
    const { branding } = useTheme();
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();

    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [error, setError] = useState('');
    const consumedRef = useRef(false);

    // Complete Google sign-in (?token=...) or surface its error (?error=...).
    useEffect(() => {
        const token = params.get('token');
        const oauthError = params.get('error');
        if (!token && !oauthError) return;
        if (consumedRef.current) return;
        consumedRef.current = true;
        setParams({}, { replace: true }); // scrub the token from the URL/history

        if (oauthError) {
            setError(oauthError);
            return;
        }
        setGoogleLoading(true);
        loginWithToken(token)
            .then((user) => {
                toast.success(`Welcome back, ${user.name.split(' ')[0]}`);
                navigate(homeFor(user));
            })
            .catch(() => setError('Google sign-in could not be completed. Please try again.'))
            .finally(() => setGoogleLoading(false));
    }, [params, setParams, loginWithToken, navigate]);

    async function submit(e) {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            const user = await login(identifier, password);
            toast.success(`Welcome back, ${user.name.split(' ')[0]}`);
            navigate(homeFor(user));
        } catch (err) {
            setError(apiError(err, 'These credentials don’t match our records.'));
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink p-4 sm:p-6">
            {/* Ambient brand glows + dot grid */}
            <div className="absolute -right-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-brand/25 blur-3xl" />
            <div className="absolute -left-24 bottom-0 h-80 w-80 rounded-full bg-brand/10 blur-3xl" />
            <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '28px 28px' }} />

            <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.45, ease: 'easeOut' }}
                className="relative w-full max-w-md"
            >
                <div className="card-surface p-6 sm:p-10">
                    {/* Brand */}
                    <div className="flex flex-col items-center text-center">
                        <motion.img
                            src={branding.logo_url || '/logo2.png'}
                            alt={branding.system_name}
                            initial={{ scale: 0.85, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: 0.15, duration: 0.4 }}
                            className="h-20 w-20 rounded-full shadow-[0_0_44px_-8px_rgba(214,27,93,0.55)] ring-1 ring-border"
                        />
                        <h1 className="mt-4 font-display text-2xl font-bold">{branding.system_name}</h1>
                        <p className="mt-1 text-sm text-muted">{branding.system_tagline ?? 'Sign in to continue'}</p>
                    </div>

                    {/* Google sign-in */}
                    {branding.google_login && (
                        <>
                            <a
                                href="/auth/google/redirect"
                                className={`mt-8 flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-border bg-surface text-sm font-medium transition-all hover:bg-surface-2 active:scale-[0.98] ${googleLoading ? 'pointer-events-none opacity-60' : ''}`}
                            >
                                <GoogleIcon />
                                {googleLoading ? 'Signing you in…' : 'Continue with Google'}
                            </a>
                            <div className="mt-6 flex items-center gap-3 text-xs text-muted">
                                <div className="h-px flex-1 bg-border" />
                                or sign in with credentials
                                <div className="h-px flex-1 bg-border" />
                            </div>
                        </>
                    )}

                    {/* Credentials */}
                    <form onSubmit={submit} className={branding.google_login ? 'mt-6 space-y-4' : 'mt-8 space-y-4'}>
                        {error && (
                            <motion.div
                                initial={{ opacity: 0, y: -6 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="rounded-xl border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger"
                            >
                                {error}
                            </motion.div>
                        )}
                        <Field label="Email or username">
                            <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)}
                                placeholder="you@company.com or username" autoComplete="username" required autoFocus />
                        </Field>
                        <Field label="Password">
                            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••" autoComplete="current-password" required />
                        </Field>
                        <Button type="submit" size="lg" loading={loading} className="w-full">
                            Sign in
                        </Button>
                    </form>
                </div>

                <p className="mt-6 text-center text-xs text-sidebar-text">
                    © {new Date().getFullYear()} EAJ Systems · {branding.system_name}
                </p>
            </motion.div>
        </div>
    );
}
