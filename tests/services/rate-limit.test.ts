import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import Redis from 'ioredis';
import { checkRateLimit } from '../../src/lib/services/rate-limit';

let redis: Redis;

beforeAll(() => {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) throw new Error('REDIS_URL not set');
  redis = new Redis(redisUrl);
});

afterEach(async () => {
  const keys = await redis.keys('ratelimit:*');
  if (keys.length > 0) await redis.del(...keys);
});

afterAll(async () => {
  await redis.quit();
});

describe('rate limiter', () => {
  it('allows requests under the rate limit', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await checkRateLimit(redis, 'user-a');
      expect(result.allowed).toBe(true);
    }
  });

  it('blocks requests over the rate limit', async () => {
    for (let i = 0; i < 5; i++) {
      await checkRateLimit(redis, 'user-b');
    }

    const result = await checkRateLimit(redis, 'user-b');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it('rate limit is per-user, not global', async () => {
    // Exhaust user C's limit
    for (let i = 0; i < 5; i++) {
      await checkRateLimit(redis, 'user-c');
    }

    // User D should still be allowed
    const result = await checkRateLimit(redis, 'user-d');
    expect(result.allowed).toBe(true);
  });

  it('remaining count decrements correctly', async () => {
    const r1 = await checkRateLimit(redis, 'user-e');
    expect(r1.remaining).toBe(4);

    const r2 = await checkRateLimit(redis, 'user-e');
    expect(r2.remaining).toBe(3);
  });
});
