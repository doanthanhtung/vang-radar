import type { Redis } from "ioredis";

const RELEASE_LOCK_SCRIPT =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

export async function acquireAlertLock(redis: Redis, token: string, ttlMs: number): Promise<boolean> {
  const result = await redis.set("vangscore:buy-alerts:send-lock", token, "PX", ttlMs, "NX");
  return result === "OK";
}

export async function releaseAlertLock(redis: Redis, token: string): Promise<void> {
  await redis.eval(RELEASE_LOCK_SCRIPT, 1, "vangscore:buy-alerts:send-lock", token);
}
