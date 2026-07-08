import {
    LayoutDashboard, Users, Clock, CalendarClock, Gift, Briefcase, CalendarDays,
    Megaphone, Target, Wallet, BarChart3, Building2, Receipt, Settings, UserCircle, UserCog,
} from 'lucide-react';

/**
 * Admin/HR navigation. Each item is gated by a module permission (view).
 * Items with `superAdmin` only render for SuperAdmin.
 */
export const ADMIN_NAV = [
    { to: '/app', label: 'Dashboard', icon: LayoutDashboard, module: null },
    { to: '/app/employees', label: 'Employees', icon: Users, module: 'employees' },
    { to: '/app/attendance', label: 'Attendance', icon: Clock, module: 'attendance' },
    { to: '/app/leave', label: 'Leave', icon: CalendarClock, module: 'leave' },
    { to: '/app/service-credits', label: 'Service Credits', icon: Gift, module: 'service_credits' },
    { to: '/app/recruitment', label: 'Recruitment', icon: Briefcase, module: 'recruitment' },
    { to: '/app/events', label: 'Events', icon: CalendarDays, module: 'events' },
    { to: '/app/announcements', label: 'Announcements', icon: Megaphone, module: 'announcements' },
    { to: '/app/performance', label: 'Performance', icon: Target, module: 'performance' },
    { to: '/app/payroll', label: 'Payroll', icon: Wallet, module: 'payroll' },
    { to: '/app/analytics', label: 'Analytics', icon: BarChart3, module: 'analytics' },
    { to: '/app/branches', label: 'Branches', icon: Building2, module: 'branches' },
    { to: '/app/billing', label: 'Billing', icon: Receipt, module: 'billing' },
    { to: '/app/users', label: 'User Management', icon: UserCog, module: 'users' },
    { to: '/app/settings', label: 'Settings', icon: Settings, module: 'settings' },
];

// Employee Self-Service navigation (every employee).
export const ESS_NAV = [
    { to: '/ess', label: 'My Dashboard', icon: LayoutDashboard },
    { to: '/ess/clock', label: 'Clock In / Out', icon: Clock },
    { to: '/ess/leave', label: 'My Leave', icon: CalendarClock },
    { to: '/ess/credits', label: 'Service Credits', icon: Gift },
    { to: '/ess/payslips', label: 'Payslips', icon: Wallet },
    { to: '/ess/events', label: 'Events', icon: CalendarDays },
    { to: '/ess/jobs', label: 'Internal Jobs', icon: Briefcase },
    { to: '/ess/profile', label: 'My Profile', icon: UserCircle },
];
