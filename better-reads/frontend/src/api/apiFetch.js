const BASE_URL = import.meta.env.VITE_BACKEND_URL;

export const apiFetch = async (endpoint, options = {}) => {
    // 1. Prepare Headers
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    // Inject the JWT from localStorage
    const token = localStorage.getItem('token');
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }


    const config = {
        ...options,
        headers,
        // allows the browser to send the HttpOnly Fingerprint cookie automatically
        credentials: 'include', 
    };
    const url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint}`;
    const response = await fetch(url, config);

    // Handle Global Errors (401 Unauthorized)
    if (response.status === 401) {
        console.error('Security alert or session expired. Redirecting...');
        localStorage.removeItem('token');
        
        // Only redirect if we aren't already on the login page
        if (!window.location.pathname.includes('/login')) {
            window.location.href = '/login';
        }
        return Promise.reject('Unauthorized');
    }

    return response;
};
