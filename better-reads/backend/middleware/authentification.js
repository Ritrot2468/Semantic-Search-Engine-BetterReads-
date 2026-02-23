import jwt from 'jsonwebtoken';
import crypto from 'crypto';


export const protect = (req, res, next) => {
    if (req.method === 'OPTIONS') {
        return next();
    }
    console.log(">>> PROTECT MIDDLEWARE HIT <<<"); // Put this here!
    const fingerprint = req.cookies['__Secure-Fp'] || req.cookies['fp'];
    if (!fingerprint) return res.status(401).json({ error: 'Authentication failed' });

    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        console.log("AUTH ERROR: No token found in request"); // DEBUG
        return res.status(401).json({ error: 'Not authorized, no token' });
    }

    try {
        // verify identiyt
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log("1. Cookie from Browser:", fingerprint);
        console.log("Method:", req.method);
        console.log("Raw Cookie:", fingerprint);
        console.log("Token fgp:", decoded.fgp);
        //const decodedFingerprint = decodeURIComponent(fingerprint);


        // RE-HASH the cookie fingerprint and compare it to the one in the JWT -> check that the token was protected and not stolen
        const cleanFingerprint = decodeURIComponent(String(fingerprint));
const fingerprintHash = crypto.createHash('sha256').update(cleanFingerprint).digest('hex');
        console.log("--- SECURITY CHECK ---");
        console.log("Cookie received:", fingerprint.substring(0, 10) + "...");
        console.log("3. Generated Hash:", fingerprintHash);
        console.log("4. Hash in JWT:", decoded.fgp);

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
        res.status(401).json({ error: 'Invalid session',
            method: req.method,        // Tells us if it's the OPTIONS or PATCH failing
            hasToken: !!token,         // Tells us if the header made it
            hasCookie: !!fingerprint
         });
    }
};