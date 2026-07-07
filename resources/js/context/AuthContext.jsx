import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api, { setToken, getToken } from '@/lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const loadMe = useCallback(async () => {
        if (!getToken()) {
            setLoading(false);
            return;
        }
        try {
            const { data } = await api.get('/me');
            setUser(data.data ?? data);
        } catch {
            setToken(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadMe();
    }, [loadMe]);

    const login = useCallback(async (email, password) => {
        const { data } = await api.post('/login', { email, password, device_name: 'spa' });
        setToken(data.token);
        setUser(data.user.data ?? data.user);
        return data.user.data ?? data.user;
    }, []);

    const logout = useCallback(async () => {
        try {
            await api.post('/logout');
        } catch {
            /* ignore */
        }
        setToken(null);
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
