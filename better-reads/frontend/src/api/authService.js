import { apiFetch } from '../api/apiFetch.js';

export const verifySession = async () => {
    const token = localStorage.getItem('token');
    if (!token) return false;

    try {
        const res = await apiFetch(`${BASE_URL}/auth/verify`);
        if (res.status === 401) {
            localStorage.removeItem('token');
            return false;
        }
        return true;
    } catch {
        return false;
    }
};