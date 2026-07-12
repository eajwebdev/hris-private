import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api, { csrf } from '@/lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    /*
     * There is no client-readable credential to check any more — the session lives in an
     * httpOnly cookie. So we simply ask the server who we are; a 401 means "nobody".
     * Returns the user (or null), which the OAuth landing on Login.jsx relies on.
     */
    const loadMe = useCallback(async () => {
        try {
            const { data } = await api.get('/me');
            const u = data.data ?? data;
            setUser(u);
            return u;
        } catch {
            setUser(null);
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadMe();
    }, [loadMe]);

    // `identifier` is an email address or a username.
    const login = useCallback(async (identifier, password) => {
        await csrf(); // must precede the first stateful write of the session
        const { data } = await api.post('/login', { login: identifier, password });
        const u = data.user.data ?? data.user;
        setUser(u);
        return u;
    }, []);

    const logout = useCallback(async () => {
        try {
            await api.post('/logout');
        } catch {
            /* ignore */
        }
        setUser(null);
        window.location.href = '/login';
    }, []);

    // Permission helper mirroring the backend: SuperAdmin bypasses everything.
    const can = useCallback(
        (module, ability = 'view') => {
            if (!user) return false;
            if (user.is_super_admin) return true;
            return Boolean(user.permissions?.[module]?.[ability]);
        },
        [user]
    );

    return (
        <AuthContext.Provider value={{ user, setUser, loading, login, logout, can, refresh: loadMe }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
