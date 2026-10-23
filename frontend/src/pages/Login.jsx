import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
export function Login() {
    const { enabled, user, signIn, signUp } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [mode, setMode] = useState('login');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const destination = location.state?.from ?? '/dashboard';
    if (!enabled || user)
        return <Navigate to={destination} replace/>;
    async function submit(event) {
        event.preventDefault();
        setError(null);
        setBusy(true);
        try {
            if (mode === 'login')
                await signIn(email, password);
            else
                await signUp(name, email, password);
            navigate(destination, { replace: true });
        }
        catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Something went wrong.');
        }
        finally {
            setBusy(false);
        }
    }
    const inputClass = 'mt-1.5 w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20';
    return (<div className="flex min-h-screen items-center justify-center bg-canvas px-4 font-sans text-ink">
      <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-6 shadow-card">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-white shadow-card">
            <ShieldCheck className="h-5 w-5" aria-hidden="true"/>
          </span>
          <div>
            <h1 className="text-base font-semibold tracking-tight">ModeraAI</h1>
            <p className="text-xs text-ink-muted">{mode === 'login' ? 'Sign in to your workspace' : 'Create your account'}</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4" noValidate={false}>
          {mode === 'register' && (<label className="block text-xs font-medium text-ink-muted">Name
              <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoComplete="name"/>
            </label>)}
          <label className="block text-xs font-medium text-ink-muted">Email
            <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email"/>
          </label>
          <label className="block text-xs font-medium text-ink-muted">Password
            <input className={inputClass} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={mode === 'register' ? 8 : 1} maxLength={72} autoComplete={mode === 'login' ? 'current-password' : 'new-password'}/>
            {mode === 'register' && <span className="mt-1 block text-[11px] text-ink-faint">At least 8 characters.</span>}
          </label>

          {error && <p role="alert" className="rounded-lg bg-critical/10 px-3 py-2 text-xs text-critical ring-1 ring-inset ring-critical/25">{error}</p>}

          <button type="submit" disabled={busy} className="w-full rounded-lg bg-accent px-3.5 py-2.5 text-sm font-semibold text-white shadow-card hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:opacity-60">
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }} className="mt-4 w-full text-center text-xs font-medium text-accent hover:text-accent/80">
          {mode === 'login' ? "Don't have an account? Create one" : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>);
}
