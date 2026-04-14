import Redis from 'ioredis';

export function createRedisClient(): Redis {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error('REDIS_URL environment variable is required');
  }
  return new Redis(redisUrl);
}

export async function cacheGet<T>(redis: Redis, key: string): Promise<T | null> {
  const raw = await redis.get(key);
  if (raw === null) return null;
  return JSON.parse(raw) as T;
}

export async function cacheSet(redis: Redis, key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  const serialized = JSON.stringify(value);
  if (ttlSeconds !== undefined) {
    await redis.set(key, serialized, 'EX', ttlSeconds);
  } else {
    await redis.set(key, serialized);
  }
}

export async function cacheDelete(redis: Redis, key: string): Promise<void> {
  await redis.del(key);
}
