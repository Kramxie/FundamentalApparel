// Simple per-user rate limiter for review submissions (in-memory)
// Limits to X reviews per 24 hours per user. This is a lightweight safeguard —
// for production consider redis or a persistent store.
const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_REVIEWS_PER_WINDOW = 20; // configurable limit

const store = new Map(); // userId -> { count, firstTs }

module.exports = function reviewRateLimiter(req, res, next) {
  try {
    const userId = req.user && req.user._id && req.user._id.toString();
    if (!userId) return res.status(401).json({ success: false, msg: 'Unauthorized' });

    const now = Date.now();
    const entry = store.get(userId);
    if (!entry) {
      store.set(userId, { count: 1, firstTs: now });
      return next();
    }

    // If window expired, reset
    if (now - entry.firstTs > WINDOW_MS) {
      store.set(userId, { count: 1, firstTs: now });
      return next();
    }

    if (entry.count >= MAX_REVIEWS_PER_WINDOW) {
      return res.status(429).json({ success: false, msg: `Rate limit exceeded: max ${MAX_REVIEWS_PER_WINDOW} reviews per 24 hours.` });
    }

    entry.count += 1;
    store.set(userId, entry);
    return next();
  } catch (err) {
    // Non-fatal: allow request to proceed if limiter fails
    console.warn('[reviewRateLimiter] Error:', err && err.message);
    return next();
  }
};
