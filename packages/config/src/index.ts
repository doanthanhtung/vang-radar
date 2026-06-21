import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_PORT: z.coerce.number().int().positive().default(3000),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  GOLDAPI_KEY: z.string().optional().default(""),
  METALS_DEV_API_KEY: z.string().optional().default(""),
  METALS_API_KEY: z.string().optional().default(""),
  VNAPPMOB_API_KEY: z.string().optional().default(""),
  VNAPPMOB_API_URL: z
    .string()
    .url()
    .or(z.literal(""))
    .default("https://vapi.vnappmob.com/api/v2/exchange_rate/sbv"),
  VIETNAM_GOLD_API_URL: z.string().url().or(z.literal("")).default(""),
  VIETNAM_GOLD_API_KEY: z.string().optional().default(""),
  FETCH_INTERVAL_DOMESTIC_CRON: z.string().default("*/5 * * * *"),
  FETCH_INTERVAL_WORLD_CRON: z.string().default("*/1 * * * *"),
  FETCH_INTERVAL_FX_CRON: z.string().default("*/5 * * * *"),
  ADMIN_USERNAME: z.string().min(1).default("admin"),
  ADMIN_PASSWORD: z.string().min(1).default("change_me"),
  PUBLIC_WEB_URL: z.string().url().optional(),
  PUBLIC_API_BASE_URL: z.string().url().default("http://localhost:4000/api/v1")
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return envSchema.parse(env);
}

export const publicCacheControl = "public, s-maxage=60, stale-while-revalidate=300";
export const noStoreCacheControl = "no-store, no-cache, must-revalidate, proxy-revalidate";
