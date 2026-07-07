import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api from '@/lib/api';

const ThemeContext = createContext(null);

const MODE_KEY = 'eaj_hris_mode';

export const THEME_PRESETS = {
    Meridian: { brand: '#2f6f5e', amber: '#e0a458' },
    Midnight: { brand: '#5b7cfa', amber: '#f0b000' },
    Clean: { brand: '#111827', amber: '#d97706' },
};

/** Writes a { brand, amber, ... } map onto :root as CSS variables. */
function applyVars(vars = {}) {
    const root = document.documentElement;
    Object.entries(vars).forEach(([k, v]) => {
        if (v) root.style.setProperty(`--${k}`, v);
    });
}

export function ThemeProvider({ children }) {
    const [mode, setMode] = useState(() => localStorage.getItem(MODE_KEY) || 'light');
    const [theme, setThemeState] = useState({});
    // Branding is loaded from the DB so name + logo reflect app-wide instantly.
    const [branding, setBranding] = useState({ system_name: 'EAJ HRIS', system_tagline: 'Human Resources', logo_url: null });

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', mode);
        localStorage.setItem(MODE_KEY, mode);
    }, [mode]);

    const loadBranding = useCallback(() => {
        return api.get('/meta/branding')
            .then(({ data }) => {
                if (data?.system_name) {
                    setBranding({ system_name: data.system_name, system_tagline: data.system_tagline, logo_url: data.logo_url });
                    document.title = data.system_name;
                }
                if (data?.mode) setMode(data.mode);
                if (data?.vars) {
                    const clean = Object.fromEntries(Object.entries(data.vars).filter(([, v]) => v));
                    setThemeState(clean);
                    applyVars(clean);
                }
            })
            .catch(() => {});
    }, []);

    useEffect(() => {
        loadBranding();
    }, [loadBranding]);

    const toggleMode = useCallback(() => setMode((m) => (m === 'dark' ? 'light' : 'dark')), []);

    const setTheme = useCallback((vars) => {
        setThemeState((prev) => ({ ...prev, ...vars }));
        applyVars(vars);
    }, []);

    // Live-apply a branding update from the settings editor (no reload).
    const applyBranding = useCallback((next) => {
        setBranding((prev) => ({ ...prev, ...next }));
        if (next.system_name) document.title = next.system_name;
    }, []);

    return (
        <ThemeContext.Provider value={{ mode, setMode, toggleMode, theme, setTheme, branding, applyBranding, reloadBranding: loadBranding }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
    return ctx;
}
