import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { ChevronRight, LogOut, Menu, ShieldCheck, X } from 'lucide-react';
import { useAuth, useCurrentModerator } from '../lib/auth';
import { getPageTitle, navigationItems } from './navigation';
export function AppLayout() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const location = useLocation();
    const moderator = useCurrentModerator();
    const { enabled: authEnabled, signOut } = useAuth();
    const pageTitle = getPageTitle(location.pathname);
    return (<div className="min-h-screen bg-canvas font-sans text-ink">
      <aside className={[
            'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-line bg-surface transition-transform duration-200 ease-out lg:translate-x-0',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        ].join(' ')} aria-label="Primary navigation">
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-line px-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-white shadow-card">
            <ShieldCheck className="h-5 w-5" aria-hidden="true"/>
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight text-ink">ModeraAI</p>
            <p className="truncate text-[10px] uppercase tracking-wider text-ink-faint">Trust operations</p>
          </div>
          <button type="button" onClick={() => setSidebarOpen(false)} className="ml-auto rounded-md p-1.5 text-ink-faint hover:bg-panel hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent lg:hidden" aria-label="Close navigation">
            <X className="h-4 w-4" aria-hidden="true"/>
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5" aria-label="Workspace sections">
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">Workspace</p>
          {navigationItems.map((item) => {
            const Icon = item.icon;
            return (<NavLink key={item.to} to={item.to} onClick={() => setSidebarOpen(false)} className={({ isActive }) => [
                    'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                    isActive ? 'bg-accent/10 text-accent ring-1 ring-inset ring-accent/20' : 'text-ink-muted hover:bg-panel hover:text-ink'
                ].join(' ')}>
                {({ isActive }) => (<>
                    <Icon className={['h-4 w-4 shrink-0', isActive ? 'text-accent' : 'text-ink-faint group-hover:text-ink-muted'].join(' ')} aria-hidden="true"/>
                    <span className="flex-1">{item.label}</span>
                    {isActive && <ChevronRight className="h-3.5 w-3.5" aria-hidden="true"/>}
                  </>)}
              </NavLink>);
        })}
        </nav>

        <div className="border-t border-line p-4">
          <div className="rounded-lg border border-line bg-panel p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-accent">{authEnabled ? 'Connected workspace' : 'Demo workspace'}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">{authEnabled ? 'Videos, results, review decisions, and overview metrics use the backend.' : 'Demo data is limited to the video library and review queue. Overview requires a backend connection.'}</p>
          </div>
        </div>
      </aside>

      {sidebarOpen && (<button type="button" className="fixed inset-0 z-40 bg-ink/30 lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="Close navigation overlay"/>)}

      <div className="min-h-screen lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-line bg-surface/95 px-4 backdrop-blur sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => setSidebarOpen(true)} className="rounded-lg p-2 text-ink-muted hover:bg-panel hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent lg:hidden" aria-label="Open navigation">
              <Menu className="h-5 w-5" aria-hidden="true"/>
            </button>
            <div className="min-w-0">
              <p className="truncate text-[11px] font-medium uppercase tracking-wider text-ink-faint">Content safety workspace</p>
              <h1 className="truncate text-base font-semibold tracking-tight text-ink">{pageTitle}</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-2 rounded-full bg-moderate/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-moderate ring-1 ring-inset ring-moderate/25 sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-moderate" aria-hidden="true"/>
              {authEnabled ? 'Backend connected' : 'Demo environment'}
            </span>
            <div className="hidden h-7 w-px bg-line sm:block" aria-hidden="true"/>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-white">{moderator.initials}</span>
              <div className="hidden leading-tight md:block">
                <p className="text-xs font-semibold text-ink">{moderator.name}</p>
                <p className="text-[10px] text-ink-faint">{moderator.role}</p>
              </div>
            </div>
            {authEnabled && (<button type="button" onClick={signOut} className="rounded-lg p-2 text-ink-muted hover:bg-panel hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent" aria-label="Sign out" title="Sign out">
                <LogOut className="h-4 w-4" aria-hidden="true"/>
              </button>)}
          </div>
        </header>
        <main className="min-w-0 px-4 py-5 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>);
}
