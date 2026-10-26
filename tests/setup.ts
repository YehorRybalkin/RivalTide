(process.env as Record<string, string>).NODE_ENV ??= "test";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://rivaltide:rivaltide@localhost:5432/rivaltide_test";
process.env.MONITOR_ALLOW_PRIVATE_HOSTS = "127.0.0.2";
process.env.MONITOR_DOMAIN_INTERVAL_MS = "0";
process.env.EMAIL_PROVIDER = "log";
process.env.AI_PROVIDER = "none";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.STRIPE_SECRET_KEY;
