import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  SESSION_COOKIE_NAME: z.string().default("rt_session"),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  TRIAL_DAYS: z.coerce.number().int().min(0).max(90).default(14),

  // Monitoring
  MONITOR_USER_AGENT: z.string().default("RivalTideBot/1.0 (+https://rivaltide.com/bot)"),
  MONITOR_ROBOTS_TOKEN: z.string().default("RivalTideBot"),
  MONITOR_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(15000),
  MONITOR_MAX_BYTES: z.coerce.number().int().min(10_000).max(20_000_000).default(3_000_000),
  MONITOR_MAX_REDIRECTS: z.coerce.number().int().min(0).max(10).default(5),
  MONITOR_DOMAIN_INTERVAL_MS: z.coerce.number().int().min(0).default(10_000),
  MONITOR_BROWSER_ENABLED: bool,
  // Development/test only: comma-separated host:port list that may resolve to private IPs.
  MONITOR_ALLOW_PRIVATE_HOSTS: z.string().optional(),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(4),
  WORKER_POLL_MS: z.coerce.number().int().min(250).default(5000),
  SNAPSHOT_RETENTION_DAYS: z.coerce.number().int().min(7).default(180),

  // AI
  AI_PROVIDER: z.enum(["anthropic", "openai", "none"]).default("anthropic"),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().optional(),
  AI_TIMEOUT_MS: z.coerce.number().int().min(5000).default(60_000),
  AI_MAX_INPUT_CHARS: z.coerce.number().int().min(1000).default(12_000),

  // Email
  EMAIL_PROVIDER: z.enum(["resend", "log", "none"]).default("log"),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("RivalTide <alerts@rivaltide.local>"),

  // Billing
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_STARTER: z.string().optional(),
  STRIPE_PRICE_GROWTH: z.string().optional(),
  STRIPE_PRICE_AGENCY: z.string().optional(),

  CRON_SECRET: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  if (parsed.data.NODE_ENV === "production" && parsed.data.MONITOR_ALLOW_PRIVATE_HOSTS) {
    throw new Error("MONITOR_ALLOW_PRIVATE_HOSTS must not be set in production");
  }
  cached = parsed.data;
  return cached;
}

export function isStripeConfigured(): boolean {
  const e = env();
  return Boolean(e.STRIPE_SECRET_KEY && e.STRIPE_WEBHOOK_SECRET && e.STRIPE_PRICE_STARTER && e.STRIPE_PRICE_GROWTH && e.STRIPE_PRICE_AGENCY);
}

export function isAiConfigured(): boolean {
  const e = env();
  if (e.AI_PROVIDER === "anthropic") return Boolean(e.ANTHROPIC_API_KEY);
  if (e.AI_PROVIDER === "openai") return Boolean(e.OPENAI_API_KEY);
  return false;
}

export function isEmailConfigured(): boolean {
  const e = env();
  return e.EMAIL_PROVIDER === "resend" && Boolean(e.RESEND_API_KEY);
}
