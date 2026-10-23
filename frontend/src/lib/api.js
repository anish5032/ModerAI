import { apiBaseUrl } from './config';
const TOKEN_KEY = 'moderaai.token';
export class ApiError extends Error {
    status;
    constructor(message, status) {
        super(message);
        this.status = status;
        this.name = 'ApiError';
    }
}
export const tokenStore = {
    get() {
        try {
            return window.localStorage.getItem(TOKEN_KEY);
        }
        catch {
            return null;
        }
    },
    set(token) {
        try {
            window.localStorage.setItem(TOKEN_KEY, token);
        }
        catch { /* storage unavailable */ }
    },
    clear() {
        try {
            window.localStorage.removeItem(TOKEN_KEY);
        }
        catch { /* storage unavailable */ }
    }
};
let onUnauthorized = null;
export function setUnauthorizedHandler(handler) {
    onUnauthorized = handler;
}
function messageFromBody(body, fallback) {
    if (body && typeof body === 'object' && 'detail' in body) {
        const detail = body.detail;
        if (typeof detail === 'string')
            return detail;
        // FastAPI validation errors: [{ msg, loc, ... }]
        if (Array.isArray(detail) && detail[0] && typeof detail[0].msg === 'string')
            return detail[0].msg;
    }
    return fallback;
}
export async function apiRequest(path, options = {}) {
    const { method = 'GET', json, form, auth = true } = options;
    const headers = {};
    if (auth) {
        const token = tokenStore.get();
        if (token)
            headers.Authorization = `Bearer ${token}`;
    }
    if (json !== undefined)
        headers['Content-Type'] = 'application/json';
    let response;
    try {
        response = await fetch(`${apiBaseUrl}${path}`, {
            method,
            headers,
            body: form ?? (json !== undefined ? JSON.stringify(json) : undefined)
        });
    }
    catch {
        throw new ApiError('Cannot reach the server. Check that the backend is running.', 0);
    }
    if (response.status === 204)
        return undefined;
    let body = null;
    try {
        body = await response.json();
    }
    catch { /* non-JSON body */ }
    if (!response.ok) {
        if (response.status === 401 && auth)
            onUnauthorized?.();
        throw new ApiError(messageFromBody(body, `Request failed (${response.status}).`), response.status);
    }
    return body;
}
