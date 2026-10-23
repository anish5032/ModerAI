import { apiRequest } from '../lib/api';
import { apiBaseUrl } from '../lib/config';
export const authApi = {
    login: (email, password) => apiRequest('/api/auth/login', { method: 'POST', json: { email, password }, auth: false }),
    register: (name, email, password) => apiRequest('/api/auth/register', { method: 'POST', json: { name, email, password }, auth: false }),
    me: () => apiRequest('/api/auth/me')
};
export const videoApi = {
    list(query = {}) {
        const params = new URLSearchParams();
        if (query.q)
            params.set('q', query.q);
        if (query.risk)
            params.set('risk', query.risk);
        if (query.status)
            params.set('status', query.status);
        if (query.sort)
            params.set('sort', query.sort);
        const suffix = params.toString() ? `?${params}` : '';
        return apiRequest(`/api/videos${suffix}`);
    },
    upload(file, durationSeconds) {
        const form = new FormData();
        form.append('file', file);
        if (durationSeconds !== null)
            form.append('duration', String(durationSeconds));
        return apiRequest('/api/videos', { method: 'POST', form });
    },
    analyze: (videoId, force = false) => apiRequest(`/api/videos/${videoId}/analyze${force ? '?force=true' : ''}`, { method: 'POST' }),
    result: (videoId) => apiRequest(`/api/videos/${videoId}/result`),
    mediaTicket: (videoId) => apiRequest(`/api/videos/${encodeURIComponent(videoId)}/media-token`),
    mediaUrl: (mediaPath) => `${apiBaseUrl}${mediaPath}`,
    remove: (videoId) => apiRequest(`/api/videos/${videoId}`, { method: 'DELETE' })
};
export const reviewApi = {
    queue: (status = 'pending') => apiRequest(`/api/reviews?status=${status}`),
    summary: () => apiRequest('/api/reviews/summary'),
    decide: (eventId, action, reason) => apiRequest(`/api/events/${eventId}/decision`, { method: 'POST', json: { action, reason } })
};
