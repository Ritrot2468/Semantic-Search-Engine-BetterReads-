import jwt from 'jsonwebtoken';


export const protect = (req, res, next) => {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies && req.cookies.token) {
        token = req.cookies.token;
    }

    if (!token) {
        console.log("AUTH ERROR: No token found in request"); // DEBUG
        return res.status(401).json({ error: 'Not authorized, no token' });
    }
    
    const fingerprint = req.cookies['__Secure-Fp'];

    if (!token || !fingerprint) return res.status(401).json({ error: 'Authentication failed' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // RE-HASH the cookie fingerprint and compare it to the one in the JWT
        const fingerprintHash = crypto.createHash('sha256').update(fingerprint).digest('hex');

        if (decoded.fpg !== fingerprintHash) {
            return res.status(401).json({ error: 'Invalid access' });
        }

        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Invalid session' });
    }
};