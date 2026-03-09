import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getFromRedis, getFingerprintKey } from '../services/redisClient.js';

export const protect = async (req, res, next) => {
    if (req.method === 'OPTIONS') {
        return next();
    }
 
    const fingerprint = req.cookies['__Secure-Fp'] || req.cookies['fp'];
    if (!fingerprint) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    try {
        // Verify token and check expiration
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Check if token is expired (additional safety check)
        if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
            return res.status(401).json({ error: 'Session expired' });
        }

        // Re-hash the cookie fingerprint and compare it to the one in the JWT
        const cleanFingerprint = decodeURIComponent(String(fingerprint));
        const fingerprintHash = crypto.createHash('sha256').update(cleanFingerprint).digest('hex');

        if (decoded.fgp !== fingerprintHash) {
            // Log security event without exposing details
            console.warn(`Security: Fingerprint mismatch for user ${decoded.id || 'unknown'}`);
            return res.status(401).json({ error: 'Invalid session' });
        }

        // Check Redis blacklists for revoked sessions
        try {
            const fpKey = getFingerprintKey(req);
            const [tokenRevoked, fpRevoked] = await Promise.all([
                getFromRedis(`blacklist:token:${token}`),
                fpKey ? getFromRedis(fpKey) : Promise.resolve(null),
            ]);

            if (tokenRevoked || fpRevoked) {
                return res.status(401).json({ error: 'Session revoked' });
            }
        } catch (e) {
            console.error('Redis blacklist check failed:', e.message);
            // Best-effort: if Redis is down, fall back to JWT/fingerprint only
        }

        // Attach user info to request
        req.user = {
            id: decoded.id,
            username: decoded.username
        };
        
        next();
    } catch (err) {
        // Handle different JWT errors appropriately
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Session expired' });
        } else if (err.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: 'Invalid authentication' });
        } else {
            console.error('Authentication error:', err.message);
            return res.status(401).json({ error: 'Authentication failed' });
        }
    }
};