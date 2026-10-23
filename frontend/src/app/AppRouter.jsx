import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { RequireAuth, AuthProvider } from '../lib/auth';
import { Dashboard } from '../pages/Dashboard';
import { Login } from '../pages/Login';
import { Moderation } from '../pages/Moderation';
import { Reviews } from '../pages/Reviews';
import { Videos } from '../pages/Videos';
export function AppRoutes() {
    return (<Routes>
      <Route path="/login" element={<Login />}/>
      <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route path="/" element={<Navigate to="/dashboard" replace/>}/>
        <Route path="/dashboard" element={<Dashboard />}/>
        <Route path="/moderation" element={<Moderation />}/>
        <Route path="/videos" element={<Videos />}/>
        <Route path="/reviews" element={<Reviews />}/>
        <Route path="*" element={<Navigate to="/dashboard" replace/>}/>
      </Route>
    </Routes>);
}
export function AppRouter() {
    return (<BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>);
}
