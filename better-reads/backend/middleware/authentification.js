import jwt from 'jsonwebtoken';


export const protect = (req, res, next) => {
    console.log(">>> PROTECT MIDDLEWARE HIT <<<"); // Put this here!
    const fingerprint = req.cookies['__Secure-Fp']; 
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
        const decodedFingerprint = decodeURIComponent(fingerprint);
       
        // RE-HASH the cookie fingerprint and compare it to the one in the JWT -> check that the token was protected and not stolen
        const fingerprintHash = crypto.createHash('sha256').update(decodedFingerprint).digest('hex');
    
        if (decoded.fgp !== fingerprintHash) {
            return res.status(401).json({ error: 'Invalid access' });
        }

        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Invalid session' });
    }
};