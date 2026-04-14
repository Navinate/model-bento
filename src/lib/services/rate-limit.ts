import type Redis from 'ioredis';

const MAX_REQUESTS = 5;
const WINDOW_SECONDS = 3600; // 1 hour

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter?: number;
}

export async function checkRateLimit(
  redis: Redis,
  userId: string,
): Promise<RateLimitResult> {
  const key = `ratelimit:generate:${userId}`;

  const current = await redis.incr(key);

  // Set TTL on first request
  if (current === 1) {
    await redis.expire(key, WINDOW_SECONDS);
  }

  if (current > MAX_REQUESTS) {
    const ttl = await redis.ttl(key);
    return {
      allowed: false,
      remaining: 0,
      retryAfter: ttl > 0 ? ttl : WINDOW_SECONDS,
    };
  }

  return {
    allowed: true,
    remaining: MAX_REQUESTS - current,
  };
}
