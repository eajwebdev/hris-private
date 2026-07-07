import { Routes, Route, Navigate } from 'react-router-dom';
import { RequireAuth, RequireModule } from '@/components/Guards';
import { AppShell } from '@/layouts/AppShell';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import Placeholder from '@/pages/Placeholder';
import EmployeesList from '@/pages/employees/EmployeesList';
import EmployeeDetail from '@/pages/employees/EmployeeDetail';
import OrgChart from '@/pages/employees/OrgChart';
import AttendancePage from '@/pages/attendance/AttendancePage';
import EventsCalendar from '@/pages/events/EventsCalendar';
import SystemSettings from '@/pages/SystemSettings';
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
                <Route path="leave" element={<M module="leave"><Placeholder title="Leave" /></M>} />
                <Route path="service-credits" element={<M module="service_credits"><Placeholder title="Service Credits" /></M>} />
                <Route path="recruitment" element={<M module="recruitment"><Placeholder title="Recruitment" /></M>} />
                <Route path="events" element={<M module="events"><EventsCalendar /></M>} />
                <Route path="announcements" element={<M module="announcements"><Placeholder title="Announcements" /></M>} />
                <Route path="performance" element={<M module="performance"><Placeholder title="Performance" /></M>} />
                <Route path="payroll" element={<M module="payroll"><Placeholder title="Payroll" /></M>} />
                <Route path="analytics" element={<M module="analytics"><Placeholder title="Analytics & Reports" /></M>} />
                <Route path="branches" element={<M module="branches"><Placeholder title="Branches" /></M>} />
                <Route path="billing" element={<M module="billing"><Placeholder title="Billing" /></M>} />
                <Route path="settings" element={<M module="settings"><SystemSettings /></M>} />
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
                <Route path="leave" element={<Placeholder title="My Leave" subtitle="Coming in Phase 5" />} />
                <Route path="credits" element={<Placeholder title="Service Credits" subtitle="Coming in Phase 5" />} />
                <Route path="payslips" element={<Placeholder title="Payslips" subtitle="Coming in Phase 9" />} />
                <Route path="jobs" element={<Placeholder title="Internal Jobs" subtitle="Coming in Phase 6" />} />
                <Route path="profile" element={<Placeholder title="My Profile" subtitle="Coming in Phase 8" />} />
            </Route>

            {/* Public careers portal (no auth) */}
            <Route path="/careers/*" element={<Placeholder title="Careers" subtitle="Public job portal — Phase 6" />} />

            <Route path="/" element={<Navigate to="/app" replace />} />
            <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
    );
}
