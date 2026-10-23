import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
function jsonResponse(status, body) {
    return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
describe('api client', () => {
    let store;
    beforeEach(() => {
        store = {};
        vi.resetModules();
        vi.stubGlobal('window', {
            localStorage: {
                getItem: (key) => store[key] ?? null,
                setItem: (key, value) => { store[key] = value; },
                removeItem: (key) => { delete store[key]; }
            }
        });
    });
    afterEach(() => { vi.unstubAllGlobals(); });
    it('sends the bearer token and JSON body', async () => {
        const { apiRequest, tokenStore } = await import('./api');
        tokenStore.set('abc123');
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
        vi.stubGlobal('fetch', fetchMock);
        await apiRequest('/api/x', { method: 'POST', json: { a: 1 } });
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('http://localhost:5000/api/x');
        expect(init.headers.Authorization).toBe('Bearer abc123');
        expect(init.headers['Content-Type']).toBe('application/json');
        expect(init.body).toBe('{"a":1}');
    });
    it('does not send a token for login/register', async () => {
        const { apiRequest, tokenStore } = await import('./api');
        tokenStore.set('abc123');
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
        vi.stubGlobal('fetch', fetchMock);
        await apiRequest('/api/auth/login', { method: 'POST', json: {}, auth: false });
        expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
    });
    it('surfaces FastAPI error messages', async () => {
        const { apiRequest, ApiError } = await import('./api');
        vi.stubGlobal('fetch', vi.fn()
            .mockResolvedValueOnce(jsonResponse(409, { detail: 'An account with this email already exists.' }))
            .mockResolvedValueOnce(jsonResponse(422, { detail: [{ msg: 'String should have at least 8 characters', loc: ['body', 'password'] }] })));
        await expect(apiRequest('/a')).rejects.toMatchObject({ message: 'An account with this email already exists.', status: 409 });
        await expect(apiRequest('/b')).rejects.toBeInstanceOf(ApiError);
    });
    it('reports an unreachable server clearly', async () => {
        const { apiRequest } = await import('./api');
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
        await expect(apiRequest('/a')).rejects.toMatchObject({ status: 0, message: expect.stringContaining('Cannot reach the server') });
    });
    it('handles 204 No Content', async () => {
        const { apiRequest } = await import('./api');
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
        await expect(apiRequest('/a', { method: 'DELETE' })).resolves.toBeUndefined();
    });
    it('signs the user out on 401, but not for a failed login attempt', async () => {
        const { apiRequest, setUnauthorizedHandler } = await import('./api');
        const handler = vi.fn();
        setUnauthorizedHandler(handler);
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { detail: 'nope' })));
        await expect(apiRequest('/api/videos')).rejects.toBeTruthy();
        expect(handler).toHaveBeenCalledTimes(1);
        await expect(apiRequest('/api/auth/login', { method: 'POST', json: {}, auth: false })).rejects.toBeTruthy();
        expect(handler).toHaveBeenCalledTimes(1); // wrong password must not trigger "session expired"
    });
});
