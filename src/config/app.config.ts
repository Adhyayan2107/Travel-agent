import { z } from "zod";

export const AppConfigSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  DATABASE_URL: z.string(),
  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.coerce.number().default(6379),
  QDRANT_URL: z.string().default("http://localhost:6333"),
  LLM_DEFAULT_PROVIDER: z
    .enum(["openai", "google", "openrouter"])
    .default("openai"),
  RTK_BIN_PATH: z.string().default("/usr/local/bin/rtk"),
  RTK_ENABLED: z.coerce.boolean().default(true),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
