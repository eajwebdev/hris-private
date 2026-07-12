import axios from 'axios';

/*
 * Auth is an httpOnly Sanctum session cookie — deliberately NOT a bearer token in
 * localStorage. Nothing here reads or stores a credential: the browser attaches the
 * cookie, and JavaScript (ours or an attacker's) cannot read it.
 *
 * withCredentials sends the session cookie; withXSRFToken makes axios echo Laravel's
 * XSRF-TOKEN cookie back as the X-XSRF-TOKEN header, which is what satisfies CSRF.
 */
const api = axios.create({
    baseURL: '/api/v1',
    headers: { Accept: 'application/json' },
    withCredentials: true,
    withXSRFToken: true,
});

/**
 * Prime the CSRF cookie. Must be awaited before the first stateful write of a session
 * (i.e. before login) — without it Laravel has nothing to compare the X-XSRF-TOKEN against.
 */
export function csrf() {
    return axios.get('/sanctum/csrf-cookie', { withCredentials: true });
}

// On 401 the session is gone (expired, or signed out in another tab) — fall back to login.
api.interceptors.response.use(
    (res) => res,
    (error) => {
        if (error.response?.status === 401) {
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

/**
 * Fetch a PDF (or any binary) from the API and hand it to the browser.
 *
 * Kept over a plain <a href> so the response can be inspected: a direct link would
 * navigate away on error rather than surfacing it, and a 401 would render the login
 * HTML into a new tab instead of bouncing the user to it.
 */
export async function openBlob(url, { download = false, filename = 'download.pdf' } = {}) {
    const { data: blob } = await api.get(url, {
        params: download ? { download: 1 } : undefined,
        responseType: 'blob',
    });

    const href = URL.createObjectURL(blob);

    if (download) {
        const link = document.createElement('a');
        link.href = href;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
    } else {
        window.open(href, '_blank', 'noopener');
    }

    // Revoking synchronously can cancel a download that hasn't started yet.
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

export default api;
