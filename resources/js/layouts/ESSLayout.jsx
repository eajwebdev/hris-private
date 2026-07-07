import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, Sun, Moon, LogOut, LayoutGrid } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { ESS_NAV } from '@/config/nav';
import { Avatar } from '@/components/ui/Avatar';
import { Brand } from '@/components/Brand';
import { NotificationBell } from '@/components/NotificationBell';
import { cn } from '@/lib/utils';

function Nav({ onNavigate }) {
    return (
        <nav className="flex flex-col gap-0.5 px-3">
            {ESS_NAV.map((item) => (
                <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/ess'}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                        cn(
                            'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                            isActive ? 'bg-sidebar-active text-white' : 'text-sidebar-text hover:bg-sidebar-active/60 hover:text-white'
                        )
                    }
                >
                    <item.icon className="h-[18px] w-[18px]" />
                    {item.label}
                </NavLink>
            ))}
        </nav>
    );
}

export function ESSLayout() {
    const [open, setOpen] = useState(false);
    const { user, logout, can } = useAuth();
    const { mode, toggleMode } = useTheme();
    const navigate = useNavigate();
    const isAdmin = user?.is_super_admin || Object.values(user?.permissions ?? {}).some((m) => Object.values(m).some(Boolean));

    return (
        <div className="min-h-full">
            <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-sidebar lg:flex">
                <Brand subtitle="Self-Service" />
                <div className="flex-1 overflow-y-auto pb-6"><Nav /></div>
            </aside>

            <AnimatePresence>
                {open && (
                    <div className="fixed inset-0 z-40 lg:hidden">
                        <motion.div className="absolute inset-0 bg-ink/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
                        <motion.aside className="absolute inset-y-0 left-0 w-60 bg-sidebar flex flex-col" initial={{ x: -260 }} animate={{ x: 0 }} exit={{ x: -260 }}>
                            <div className="flex justify-end p-3"><button onClick={() => setOpen(false)} className="text-sidebar-text"><X className="h-5 w-5" /></button></div>
                            <Nav onNavigate={() => setOpen(false)} />
                        </motion.aside>
                    </div>
                )}
            </AnimatePresence>

            <div className="lg:pl-60">
                <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-mist/80 px-4 backdrop-blur sm:px-6">
                    <button className="lg:hidden text-muted" onClick={() => setOpen(true)}><Menu className="h-6 w-6" /></button>
                    <div className="flex-1" />
                    {isAdmin && (
                        <button onClick={() => navigate('/app')} className="hidden sm:flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-surface-2">
                            <LayoutGrid className="h-4 w-4" /> Admin
                        </button>
                    )}
                    <NotificationBell />
                    <button onClick={toggleMode} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2">
                        {mode === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                    </button>
                    <div className="flex items-center gap-2">
                        <Avatar name={user?.name} src={user?.avatar_url} size="sm" />
                        <button onClick={logout} className="text-muted hover:text-danger" title="Sign out"><LogOut className="h-5 w-5" /></button>
                    </div>
                </header>
                <main className="p-4 sm:p-6 lg:p-8 max-w-[1100px] mx-auto"><Outlet /></main>
            </div>
        </div>
    );
}
