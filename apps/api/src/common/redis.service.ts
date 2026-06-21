import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { loadConfig } from "@vang-radar/config";
import { Redis } from "ioredis";

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client = new Redis(loadConfig().REDIS_URL, {
    maxRetriesPerRequest: 2,
    lazyConnect: true
  });

  async getJson<T>(key: string): Promise<T | null> {
    if (process.env.NODE_ENV === "test") return null;
    try {
      const value = await this.client.get(key);
      return value ? (JSON.parse(value) as T) : null;
    } catch {
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds = 300): Promise<void> {
    if (process.env.NODE_ENV === "test") return;
    try {
      await this.client.set(key, JSON.stringify(value), "EX", ttlSeconds);
    } catch {
      // Redis cache failures must not break public reads.
    }
  }

  async onModuleDestroy() {
    if (process.env.NODE_ENV === "test") return;
    this.client.disconnect();
  }
}
