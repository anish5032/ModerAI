/**
 * VITE_USE_MOCK_API=true -> everything runs on local demo data, no backend, no login.
 * Backend mode is the default; set the flag to true to use demo data.
 */
export const useMockApi = import.meta.env.VITE_USE_MOCK_API === 'true';
export const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000').replace(/\/+$/, '');
