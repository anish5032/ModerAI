// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from './AppRouter';
import { getPageTitle, navigationItems } from './navigation';

vi.mock('../services/apiService', () => ({
    videoApi: { list: vi.fn().mockResolvedValue([]) },
    reviewApi: {
        summary: vi.fn().mockResolvedValue({ pending: 0, resolved: 0, total: 0 }),
        queue: vi.fn().mockResolvedValue([])
    },
    authApi: { me: vi.fn(), login: vi.fn(), register: vi.fn() }
}));

const routes = ['/dashboard', '/moderation', '/videos', '/reviews'];
const hiddenRoutes = ['/analytics', '/mlops', '/models', '/settings'];

async function renderAt(path) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
        root.render(<MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>);
    });
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
    return { container, root };
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('application routing', () => {
    it('renders every core workflow route', () => {
        for (const route of routes) {
            const markup = renderToString(<MemoryRouter initialEntries={[route]}>
          <AppRoutes />
        </MemoryRouter>);
            expect(markup).toContain(getPageTitle(route));
        }
    });
    it('marks the current route as active in navigation', () => {
        const markup = renderToString(<MemoryRouter initialEntries={['/reviews']}>
        <AppRoutes />
      </MemoryRouter>);
        expect(markup).toContain('aria-current="page"');
        expect(markup).toContain('Review Queue');
        expect(markup).toContain('href="/reviews"');
    });
    it('keeps the requested navigation contract centralized', () => {
        expect(navigationItems.map((item) => item.to)).toEqual(routes);
        expect(navigationItems.map((item) => item.label)).toEqual(['Overview', 'Moderation', 'Video Library', 'Review Queue']);
    });
    it('redirects hidden demo routes to the overview', async () => {
        for (const route of hiddenRoutes) {
            const { container, root } = await renderAt(route);
            expect(container.querySelector('h1')?.textContent).toBe('Overview');
            expect(navigationItems.map((item) => item.to)).not.toContain(route);
            act(() => root.unmount());
            container.remove();
        }
    });
});
