import { z } from 'zod';

const BaseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DRY_RUN: z.coerce.boolean().default(true),
});

const DatabaseEnvSchema = z.object({
  DATABASE_URL: z.string().url(),
});

const RedisEnvSchema = z.object({
  REDIS_URL: z.string().url(),
});

const AuthEnvSchema = z.object({
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('24h'),
});

const S3EnvSchema = z.object({
  S3_ENDPOINT: z.string().url(),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_REGION: z.string().default('us-east-1'),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
});

const OtelEnvSchema = z.object({
  OTEL_ENABLED: z.coerce.boolean().default(false),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  OTEL_SERVICE_NAME: z.string().default('ai-commerce-os'),
});

const CorsEnvSchema = z.object({
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
});

const RateLimitEnvSchema = z.object({
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
});

const FeatureFlagEnvSchema = z.object({
  ENABLE_RLS: z.coerce.boolean().default(false),
});

const ShopifyEnvSchema = z.object({
  SHOPIFY_SHOP_DOMAIN: z.string().optional(),
  SHOPIFY_API_VERSION: z.string().default('2024-10'),
  // Legacy: static access token (shpat_xxx)
  SHOPIFY_ACCESS_TOKEN: z.string().optional(),
  // Dev Dashboard: client credentials flow
  SHOPIFY_CLIENT_ID: z.string().optional(),
  SHOPIFY_CLIENT_SECRET: z.string().optional(),
});

const MetaTrackingEnvSchema = z.object({
  META_PIXEL_ID: z.string().optional(),
  META_ACCESS_TOKEN: z.string().optional(),
  META_API_VERSION: z.string().default('v21.0'),
  META_TEST_EVENT_CODE: z.string().optional(),
});

const TikTokTrackingEnvSchema = z.object({
  TIKTOK_PIXEL_ID: z.string().optional(),
  TIKTOK_ACCESS_TOKEN: z.string().optional(),
  TIKTOK_TEST_EVENT_CODE: z.string().optional(),
});

const TrackingEnvSchema = z.object({
  TRACKING_ENABLED: z.coerce.boolean().default(false),
  STORE_URL: z.string().optional(),
});

export const ApiEnvSchema = BaseEnvSchema
  .merge(DatabaseEnvSchema)
  .merge(RedisEnvSchema)
  .merge(AuthEnvSchema)
  .merge(S3EnvSchema)
  .merge(OtelEnvSchema)
  .merge(CorsEnvSchema)
  .merge(RateLimitEnvSchema)
  .merge(FeatureFlagEnvSchema)
  .merge(ShopifyEnvSchema)
  .merge(MetaTrackingEnvSchema)
  .merge(TikTokTrackingEnvSchema)
  .merge(TrackingEnvSchema);

export const WorkerEnvSchema = BaseEnvSchema
  .merge(DatabaseEnvSchema)
  .merge(RedisEnvSchema)
  .merge(S3EnvSchema)
  .merge(OtelEnvSchema);

export type ApiEnv = z.infer<typeof ApiEnvSchema>;
export type WorkerEnv = z.infer<typeof WorkerEnvSchema>;

export function validateEnv<T extends z.ZodTypeAny>(schema: T, env: Record<string, unknown> = process.env as any): z.infer<T> {
  const result = schema.safeParse(env);
  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Environment validation failed:\n${formatted}`);
  }
  return result.data;
}
