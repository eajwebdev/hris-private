import { useState } from 'react';
import { NavLink, useNavigate, Outlet } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, Sun, Moon, LogOut, ChevronDown, UserCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { ADMIN_NAV } from '@/config/nav';
import { Avatar } from '@/components/ui/Avatar';
import { Brand } from '@/components/Brand';
import { NotificationBell } from '@/components/NotificationBell';
import { cn } from '@/lib/utils';

function NavItems({ onNavigate }) {
    const { can, user } = useAuth();
    const items = ADMIN_NAV.filter((i) => !i.module || can(i.module, 'view'));

    return (
        <nav className="flex flex-col gap-0.5 px-3">
            {items.map((item) => (
                <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/app'}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                        cn(
                            'relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                            isActive
                                ? 'bg-sidebar-active text-white'
                                : 'text-sidebar-text hover:bg-sidebar-active/60 hover:text-white'
                        )
                    }
                >
                    {({ isActive }) => (
                        <>
                            {isActive && (
                                <motion.span
                                    layoutId="nav-indicator"
                                    className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand"
                                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                                />
                            )}
                            <item.icon className={cn('h-[18px] w-[18px] shrink-0', isActive && 'text-brand')} />
                            {item.label}
                        </>
                    )}
                </NavLink>
            ))}
        </nav>
    );
}

function UserMenu() {
    const { user, logout } = useAuth();
    const [open, setOpen] = useState(false);
    const navigate = useNavigate();

    return (
        <div className="relative">
            <button
                onClick={() => setOpen((o) => !o)}
                className="flex items-center gap-2 rounded-xl p-1 pr-2 hover:bg-surface-2 transition-colors"
            >
                <Avatar name={user?.name} src={user?.avatar_url} size="sm" />
                <div className="hidden sm:block text-left leading-tight">
                    <p className="text-sm font-medium">{user?.name}</p>
                    <p className="text-[11px] text-muted capitalize">{user?.preset?.replace('_', ' ') || 'User'}</p>
                </div>
                <ChevronDown className="h-4 w-4 text-muted" />
            </button>
            <AnimatePresence>
                {open && (
                    <>
                        <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
                        <motion.div
                            initial={{ opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            className="absolute right-0 z-20 mt-2 w-48 card-surface p-1.5"
                        >
                            <button
                                onClick={() => { setOpen(false); navigate('/ess'); }}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-surface-2"
                            >
                                <UserCircle className="h-4 w-4" /> Self-Service
                            </button>
                            <button
                                onClick={logout}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger hover:bg-danger/10"
                            >
                                <LogOut className="h-4 w-4" /> Sign out
                            </button>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}

export function AppShell() {
    const [mobileOpen, setMobileOpen] = useState(false);
    const { mode, toggleMode } = useTheme();

    return (
        <div className="min-h-full">
            {/* Desktop sidebar */}
            <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-sidebar lg:flex">
                <Brand />
                <div className="mx-6 mb-3 h-px bg-linear-to-r from-brand/50 via-white/10 to-transparent" />
                <div className="flex-1 overflow-y-auto pb-6">
                    <NavItems />
                </div>
            </aside>

            {/* Mobile drawer */}
            <AnimatePresence>
                {mobileOpen && (
                    <div className="fixed inset-0 z-40 lg:hidden">
                        <motion.div
                            className="absolute inset-0 bg-ink/50"
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => setMobileOpen(false)}
                        />
                        <motion.aside
                            className="absolute inset-y-0 left-0 w-64 flex-col bg-sidebar flex"
                            initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }}
                            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
                        >
                            <div className="flex items-center justify-between pr-3">
                                <Brand />
                                <button onClick={() => setMobileOpen(false)} className="text-sidebar-text p-2">
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto pb-6">
                                <NavItems onNavigate={() => setMobileOpen(false)} />
                            </div>
                        </motion.aside>
                    </div>
                )}
            </AnimatePresence>

            {/* Main column */}
            <div className="lg:pl-64">
                <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-border bg-mist/80 px-4 backdrop-blur sm:px-6">
                    <button className="lg:hidden text-muted" onClick={() => setMobileOpen(true)} aria-label="Open menu">
                        <Menu className="h-6 w-6" />
                    </button>
                    <div className="flex-1" />
                    <NotificationBell />
                    <button
                        onClick={toggleMode}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2"
                        aria-label="Toggle theme"
                    >
                        {mode === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                    </button>
                    <UserMenu />
                </header>
                <main className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
