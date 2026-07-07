import axios from 'axios';

const api = axios.create({
    baseURL: '/api/v1',
    headers: { Accept: 'application/json' },
});

const TOKEN_KEY = 'eaj_hris_token';

export function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
}

// Attach bearer token on every request.
api.interceptors.request.use((config) => {
    const token = getToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

// On 401, clear the token so the app falls back to the login screen.
api.interceptors.response.use(
    (res) => res,
    (error) => {
        if (error.response?.status === 401) {
            setToken(null);
            if (!window.location.pathname.startsWith('/login')) {
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

/** Extract a human-friendly message from an axios error. */
export function apiError(error, fallback = 'Something went wrong. Please try again.') {
    const res = error?.response?.data;
    if (res?.errors) return Object.values(res.errors)[0]?.[0] ?? res.message ?? fallback;
    return res?.message ?? fallback;
}

export default api;
