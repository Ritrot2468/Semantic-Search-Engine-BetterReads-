import jwt from 'jsonwebtoken';
import crypto from 'crypto';

export const protect = (req, res, next) => {
    if (req.method === 'OPTIONS') {
        return next();
    }
 
    const fingerprint = req.cookies['__Secure-Fp'] || req.cookies['fp'];
    if (!fingerprint) return res.status(401).json({ error: 'Authentication failed' });

    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return res.status(401).json({ error: 'Not authorized, no token' });
    }

    try {
        // verify identiyt
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // RE-HASH the cookie fingerprint and compare it to the one in the JWT -> check that the token was protected and not stolen
        const cleanFingerprint = decodeURIComponent(String(fingerprint));
        const fingerprintHash = crypto.createHash('sha256').update(cleanFingerprint).digest('hex');

        if (decoded.fgp !== fingerprintHash) {
            return res.status(401).json({ 
                error: 'Invalid access',
                debug: {
                    received: decoded.fgp.substring(0, 5),    
                    calculated: fingerprintHash.substring(0, 5) 
                }
            });
        }

        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Invalid session' });
    }
};