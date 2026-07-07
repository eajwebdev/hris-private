import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { LoadingBlock } from '@/components/ui/States';
import { EmptyState } from '@/components/ui/States';
import { ShieldAlert } from 'lucide-react';

/** Requires an authenticated user; otherwise bounces to /login. */
export function RequireAuth({ children }) {
    const { user, loading } = useAuth();
    const location = useLocation();

    if (loading) return <div className="min-h-screen flex items-center justify-center"><LoadingBlock /></div>;
    if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
    return children;
}

/** Requires a specific module ability (SuperAdmin bypasses). */
export function RequireModule({ module, ability = 'view', children }) {
    const { can } = useAuth();
    if (module && !can(module, ability)) {
        return (
            <EmptyState
                icon={ShieldAlert}
                title="No access to this module"
                message="You don’t have permission to view this. Ask your HR administrator to grant it."
            />
        );
    }
    return children;
}
