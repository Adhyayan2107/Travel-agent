import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private memoryCache = new Map<string, { value: string; expiry: number }>();
  private useFallback = false;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const host = this.configService.get<string>("REDIS_HOST", "localhost");
    const port = this.configService.get<number>("REDIS_PORT", 6379);

    this.logger.log(`Connecting to Redis at ${host}:${port}...`);

    try {
      this.client = new Redis({
        host,
        port,
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => {
          if (times > 3) {
            this.logger.warn(
              "Redis connection retries exceeded. Falling back to in-memory cache.",
            );
            this.useFallback = true;
            return null; // stop retrying
          }
          return Math.min(times * 100, 3000);
        },
      });

      this.client.on("error", (err) => {
        this.logger.error("Redis error occurred:", err.message);
        this.useFallback = true;
      });

      this.client.on("connect", () => {
        this.logger.log("Successfully connected to Redis.");
        this.useFallback = false;
      });
    } catch (error) {
      this.logger.error(
        "Failed to initialize Redis client. Activating in-memory fallback.",
        error,
      );
      this.useFallback = true;
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
      this.logger.log("Redis connection closed.");
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.useFallback && this.client) {
      try {
        return await this.client.get(key);
      } catch (error) {
        this.logger.warn(
          `Redis get failed for key: ${key}. Falling back to memory cache.`,
          error,
        );
        this.useFallback = true;
      }
    }

    // Memory fallback
    const cached = this.memoryCache.get(key);
    if (cached) {
      if (cached.expiry > Date.now()) {
        return cached.value;
      }
      this.memoryCache.delete(key); // Clean up expired key
    }
    return null;
  }

  async set(key: string, value: string): Promise<void> {
    if (!this.useFallback && this.client) {
      try {
        await this.client.set(key, value);
        return;
      } catch (error) {
        this.logger.warn(
          `Redis set failed for key: ${key}. Falling back to memory cache.`,
          error,
        );
        this.useFallback = true;
      }
    }

    // Memory fallback (default 1 hour expiry if none provided)
    this.memoryCache.set(key, { value, expiry: Date.now() + 3600 * 1000 });
  }

  async setex(key: string, seconds: number, value: string): Promise<void> {
    if (!this.useFallback && this.client) {
      try {
        await this.client.setex(key, seconds, value);
        return;
      } catch (error) {
        this.logger.warn(
          `Redis setex failed for key: ${key}. Falling back to memory cache.`,
          error,
        );
        this.useFallback = true;
      }
    }

    // Memory fallback
    this.memoryCache.set(key, { value, expiry: Date.now() + seconds * 1000 });
  }

  async del(key: string): Promise<void> {
    if (!this.useFallback && this.client) {
      try {
        await this.client.del(key);
        return;
      } catch (error) {
        this.logger.warn(
          `Redis del failed for key: ${key}. Falling back to memory cache.`,
          error,
        );
        this.useFallback = true;
      }
    }

    // Memory fallback
    this.memoryCache.delete(key);
  }

  /**
   * Helper to retrieve a value from cache or execute search and cache result.
   */
  async getOrSearch<T>(
    key: string,
    ttlSeconds: number,
    fallback: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.get(key);
    if (cached) {
      try {
        return JSON.parse(cached) as T;
      } catch (e) {
        this.logger.error(
          `Error parsing JSON from cache for key: ${key}. Re-fetching.`,
          e,
        );
      }
    }

    const result = await fallback();
    await this.setex(key, ttlSeconds, JSON.stringify(result));
    return result;
  }
}
