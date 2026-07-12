import { Routes, Route, Navigate } from 'react-router-dom';
import { RequireAuth, RequireModule } from '@/components/Guards';
import { AppShell } from '@/layouts/AppShell';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import EmployeesList from '@/pages/employees/EmployeesList';
import EmployeeDetail from '@/pages/employees/EmployeeDetail';
import OrgChart from '@/pages/employees/OrgChart';
import AttendancePage from '@/pages/attendance/AttendancePage';
import EventsCalendar from '@/pages/events/EventsCalendar';
import SystemSettings from '@/pages/SystemSettings';
import AuditLogPage from '@/pages/audit/AuditLogPage';
import LeavePage from '@/pages/leave/LeavePage';
import AnnouncementsPage from '@/pages/announcements/AnnouncementsPage';
import PayrollPage from '@/pages/payroll/PayrollPage';
import BranchesPage from '@/pages/branches/BranchesPage';
import ServiceCreditsPage from '@/pages/service-credits/ServiceCreditsPage';
import MyServiceCredits from '@/pages/ess/MyServiceCredits';
import RecruitmentPage from '@/pages/recruitment/RecruitmentPage';
import ReportsPage from '@/pages/reports/ReportsPage';
import PerformancePage from '@/pages/performance/PerformancePage';
import AnalyticsPage from '@/pages/analytics/AnalyticsPage';
import UsersPage from '@/pages/users/UsersPage';
import BillingPage from '@/pages/billing/BillingPage';
import CareersPortal from '@/pages/careers/CareersPortal';
import CareersJob from '@/pages/careers/CareersJob';
import MyLeave from '@/pages/ess/MyLeave';
import MyPayslips from '@/pages/ess/MyPayslips';
import MyPerformance from '@/pages/ess/MyPerformance';
import MyProfile from '@/pages/ess/MyProfile';
import InternalJobs from '@/pages/ess/InternalJobs';
import { ESSLayout } from '@/layouts/ESSLayout';
import ClockScreen from '@/pages/ess/ClockScreen';
import EssDashboard from '@/pages/ess/EssDashboard';
import EssEvents from '@/pages/ess/EssEvents';

// Wraps a module page in the permission guard.
const M = ({ module, ability, children }) => (
    <RequireModule module={module} ability={ability}>
        {children}
    </RequireModule>
);

export default function App() {
    return (
        <Routes>
            <Route path="/login" element={<Login />} />

            {/* Admin / HR app */}
            <Route
                path="/app"
                element={
                    <RequireAuth>
                        <AppShell />
                    </RequireAuth>
                }
            >
                <Route index element={<Dashboard />} />
                <Route path="employees" element={<M module="employees"><EmployeesList /></M>} />
                <Route path="employees/org-chart" element={<M module="employees"><OrgChart /></M>} />
                <Route path="employees/:id" element={<M module="employees"><EmployeeDetail /></M>} />
                <Route path="attendance" element={<M module="attendance"><AttendancePage /></M>} />
                <Route path="leave" element={<M module="leave"><LeavePage /></M>} />
                <Route path="service-credits" element={<M module="service_credits"><ServiceCreditsPage /></M>} />
                <Route path="recruitment" element={<M module="recruitment"><RecruitmentPage /></M>} />
                <Route path="events" element={<M module="events"><EventsCalendar /></M>} />
                <Route path="announcements" element={<M module="announcements"><AnnouncementsPage /></M>} />
                <Route path="performance" element={<M module="performance"><PerformancePage /></M>} />
                <Route path="payroll" element={<M module="payroll"><PayrollPage /></M>} />
                <Route path="analytics" element={<M module="analytics"><AnalyticsPage /></M>} />
                <Route path="reports" element={<M module="reports"><ReportsPage /></M>} />
                <Route path="branches" element={<M module="branches"><BranchesPage /></M>} />
                <Route path="billing" element={<M module="billing"><BillingPage /></M>} />
                <Route path="users" element={<M module="users"><UsersPage /></M>} />
                <Route path="settings" element={<M module="settings"><SystemSettings /></M>} />
                <Route path="audit-log" element={<M module="settings"><AuditLogPage /></M>} />
            </Route>

            {/* Employee Self-Service */}
            <Route
                path="/ess"
                element={
                    <RequireAuth>
                        <ESSLayout />
                    </RequireAuth>
                }
            >
                <Route index element={<EssDashboard />} />
                <Route path="clock" element={<ClockScreen />} />
                <Route path="events" element={<EssEvents />} />
                <Route path="leave" element={<MyLeave />} />
                <Route path="credits" element={<MyServiceCredits />} />
                <Route path="payslips" element={<MyPayslips />} />
                <Route path="performance" element={<MyPerformance />} />
                <Route path="jobs" element={<InternalJobs />} />
                <Route path="profile" element={<MyProfile />} />
            </Route>

            {/* Public careers portal (no auth) */}
            <Route path="/careers" element={<CareersPortal />} />
            <Route path="/careers/:slug" element={<CareersJob />} />

            <Route path="/" element={<Navigate to="/app" replace />} />
            <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
    );
}
