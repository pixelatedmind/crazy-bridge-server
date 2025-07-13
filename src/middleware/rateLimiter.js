import { RateLimiterMemory } from 'rate-limiter-flexible';

// Create rate limiters for different endpoints
const createRoomLimiter = new RateLimiterMemory({
  keyGenerator: (req) => req.ip,
  points: 5, // Number of requests
  duration: 60, // Per 60 seconds
});

const joinRoomLimiter = new RateLimiterMemory({
  keyGenerator: (req) => req.ip,
  points: 10, // Number of requests
  duration: 60, // Per 60 seconds
});

const generalLimiter = new RateLimiterMemory({
  keyGenerator: (req) => req.ip,
  points: 100, // Number of requests
  duration: 60, // Per 60 seconds
});

export const rateLimiter = async (req, res, next) => {
  try {
    let limiter = generalLimiter;

    // Choose appropriate limiter based on endpoint
    if (req.path === '/rooms/create') {
      limiter = createRoomLimiter;
    } else if (req.path === '/rooms/join') {
      limiter = joinRoomLimiter;
    }

    await limiter.consume(req.ip);
    next();
  } catch (rejRes) {
    const secs = Math.round(rejRes.msBeforeNext / 1000) || 1;
    res.set('Retry-After', String(secs));
    res.status(429).json({
      error: 'Too many requests',
      retryAfter: secs
    });
  }
};