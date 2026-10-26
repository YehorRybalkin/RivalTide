import { migrate } from "../../scripts/migrate";

const BASE = "http://localhost:3100";
const WS = "00000000-0000-4000-8000-000000000000";

export default async function globalSetup() {
  const url = process.env.E2E_DATABASE_URL ?? "postgres://rivaltide:rivaltide@localhost:5432/rivaltide_e2e";
  await migrate(url, { reset: true, log: false });
  // Warm up the dev server: compile every route once so on-demand compilation
  // does not trigger client reloads in the middle of a test.
  const routes = ["/", "/signup", "/login", "/onboarding", "/forgot-password", "/app",
    ...["", "/competitors", "/competitors/new", `/competitors/${WS}`, "/changes", `/changes/${WS}`, "/insights", "/compare", "/reports", `/reports/${WS}`,
      "/notifications", "/search", "/agency", "/settings/account", "/settings/billing", `/snapshots/${WS}`].map((p) => `/app/${WS}${p}`)];
  for (const r of routes) {
    await fetch(`${BASE}${r}`, { redirect: "manual" }).catch(() => undefined);
  }
}
