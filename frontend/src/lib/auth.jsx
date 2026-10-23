import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { setUnauthorizedHandler, tokenStore } from './api';
import { useMockApi } from './config';
import { moderator as demoModerator } from '../data/moderation';
import { authApi } from '../services/apiService';
// Default value = demo mode, so components work (and tests render) without a provider.
const AuthContext = createContext({
    enabled: false,
    user: null,
    loading: false,
    signIn: async () => undefined,
    signUp: async () => undefined,
    signOut: () => undefined
});
export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(!useMockApi && tokenStore.get() !== null);
    const signOut = useCallback(() => {
        tokenStore.clear();
        setUser(null);
    }, []);
    // Restore the session on page load.
    useEffect(() => {
        if (useMockApi)
            return;
        setUnauthorizedHandler(signOut);
        if (!tokenStore.get())
            return;
        let cancelled = false;
        authApi.me()
            .then((me) => { if (!cancelled)
            setUser(me); })
            .catch(() => { if (!cancelled)
            tokenStore.clear(); })
            .finally(() => { if (!cancelled)
            setLoading(false); });
        return () => { cancelled = true; setUnauthorizedHandler(null); };
    }, [signOut]);
    const accept = useCallback((response) => {
        tokenStore.set(response.accessToken);
        setUser(response.user);
    }, []);
    const value = useMemo(() => ({
        enabled: !useMockApi,
        user,
        loading,
        signIn: async (email, password) => accept(await authApi.login(email, password)),
        signUp: async (name, email, password) => accept(await authApi.register(name, email, password)),
        signOut
    }), [user, loading, accept, signOut]);
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() {
    return useContext(AuthContext);
}
/** Wraps protected routes. Does nothing in demo mode. */
export function RequireAuth({ children }) {
    const { enabled, user, loading } = useAuth();
    const location = useLocation();
    if (!enabled)
        return <>{children}</>;
    if (loading)
        return <div className="p-8 text-sm text-ink-muted" role="status">Loading your session…</div>;
    if (!user)
        return <Navigate to="/login" replace state={{ from: location.pathname + location.search }}/>;
    return <>{children}</>;
}
function initialsOf(name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return (parts[0]?.[0] ?? '?').concat(parts.length > 1 ? parts[parts.length - 1][0] : '').toUpperCase();
}
/** The person shown in the header: the logged-in user, or the demo persona in demo mode. */
export function useCurrentModerator() {
    const { enabled, user } = useAuth();
    if (!enabled || !user)
        return demoModerator;
    return { initials: initialsOf(user.name), name: user.name, role: user.role === 'moderator' ? 'Moderator' : user.role };
}
