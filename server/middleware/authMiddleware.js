const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Protect routes
exports.protect = async (req, res, next) => {
    console.log('[Middleware] Running protect middleware...');
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        token = req.headers.authorization.split(' ')[1];
        console.log('[Middleware] Token found in header.');
    }

    // FIX: Kung walang token, magpadala ng JSON error, huwag mag-redirect.
    if (!token) {
        console.log('[Middleware] No token found. Sending 401 error.');
        return res.status(401).json({ success: false, msg: 'Not authorized to access this route' });
    }

    try {
        console.log('[Middleware] Verifying token...');
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log('[Middleware] Token verified. Decoded ID:', decoded.id);

        req.user = await User.findById(decoded.id);
        console.log('[Middleware] User found in DB:', !!req.user);


        if (!req.user) {
             console.log('[Middleware] User not found for this token. Sending 401 error.');
             return res.status(401).json({ success: false, msg: 'User not found' });
        }

        if (!req.user.isVerified && req.user.role !== 'admin') {
            return res.status(401).json({ success: false, msg: 'Please verify your email to access this resource.' });
        }
        
        console.log('[Middleware] Authorization successful. Calling next().');
        next();
    } catch (err) {
        // FIX: Magpadala ng JSON error para sa invalid token.
        console.error('[Middleware] CRASHED during token verification:', err.name, err.message);
        return res.status(401).json({ success: false, msg: 'Not authorized, token failed' });
    }
};


// Grant access to specific roles
exports.authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !req.user.role) {
             return res.status(403).json({ 
                success: false, 
                msg: `Authentication error, user role not found.` 
            });
        }
        if (!roles.includes(req.user.role)) {
            // FIX: Magpadala ng JSON error kapag mali ang role.
            return res.status(403).json({ 
                success: false, 
                msg: `User role ${req.user.role} is not authorized to access this route` 
            });
        }
        next();
    };
};

