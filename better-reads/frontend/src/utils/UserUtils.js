import BookUtils from "./BookUtils.js";
import { apiFetch } from '../api/apiFetch.js';
const BASE_URL = import.meta.env.VITE_API_BASE_URL;

const UserUtils = {
    async changeUserPassword(username, oldPassword, newPassword) {
        try {
            const res = await apiFetch(`${BASE_URL}/users/change-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                    
                },
                body: JSON.stringify({
                    username,
                    currentPassword: oldPassword,
                    newPassword
                })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error);
            }

            return data;
        } catch (err) {
            console.error('Change password error:', err.message);
            throw err;
        }
    },
    async signOut() {
        try {
            const res = await apiFetch(`${BASE_URL}/users/logout`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        } catch (err) {
            console.error('Sign out error:', err.message);
            throw err;
        }
    }

}

export default UserUtils;