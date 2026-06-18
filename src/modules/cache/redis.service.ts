import { Injectable, OnModuleDestroy, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private memoryCache = new Map<string, { value: string; expiry: number }>();

  constructor(private readonly configService: ConfigService) {
    const enabled = this.configService.get<string>("REDIS_ENABLED", "false");
    if (enabled === "false") {
      this.logger.log("Redis disabled — using in-memory cache.");
    }
  }

  async onModuleDestroy() {}

  async get(key: string): Promise<string | null> {
    const cached = this.memoryCache.get(key);
    if (cached) {
      if (cached.expiry > Date.now()) return cached.value;
      this.memoryCache.delete(key);
    }
    return null;
  }

  async set(key: string, value: string): Promise<void> {
    this.memoryCache.set(key, { value, expiry: Date.now() + 3600 * 1000 });
  }

  async setex(key: string, seconds: number, value: string): Promise<void> {
    this.memoryCache.set(key, { value, expiry: Date.now() + seconds * 1000 });
  }

  async del(key: string): Promise<void> {
    this.memoryCache.delete(key);
  }

  async getOrSearch<T>(
    key: string,
    ttlSeconds: number,
    fallback: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.get(key);
    if (cached) {
      try {
        return JSON.parse(cached) as T;
      } catch {}
    }
    const result = await fallback();
    await this.setex(key, ttlSeconds, JSON.stringify(result));
    return result;
  }
}
