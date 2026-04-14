import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { cacheGet, cacheSet, cacheDelete, createRedisClient } from '../../src/lib/redis';
import type { Redis } from 'ioredis';

let redis: Redis;

beforeAll(() => {
  redis = createRedisClient();
});

afterAll(async () => {
  await redis.quit();
});

beforeEach(async () => {
  // Clean test keys before each test
  const keys = await redis.keys('test:*');
  if (keys.length > 0) await redis.del(...keys);
});

describe('redis cache', () => {
  it('can set and get a cached value', async () => {
    await cacheSet(redis, 'test:greeting', { hello: 'world' });
    const value = await cacheGet(redis, 'test:greeting');
    expect(value).toEqual({ hello: 'world' });
  });

  it('can delete a cached key', async () => {
    await cacheSet(redis, 'test:to-delete', { data: 123 });
    const before = await cacheGet(redis, 'test:to-delete');
    expect(before).toEqual({ data: 123 });

    await cacheDelete(redis, 'test:to-delete');
    const after = await cacheGet(redis, 'test:to-delete');
    expect(after).toBeNull();
  });

  it('expired keys return null', async () => {
    await cacheSet(redis, 'test:expiring', { temp: true }, 1); // 1 second TTL
    const before = await cacheGet(redis, 'test:expiring');
    expect(before).toEqual({ temp: true });

    // Wait for key to expire
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const after = await cacheGet(redis, 'test:expiring');
    expect(after).toBeNull();
  });
});
