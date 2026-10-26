import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { systemDb, withUser } from "@/server/db";
import { createOrganization, signUp } from "@/server/services/accounts";
import { resolveWorkspace, type WorkspaceCtx } from "@/server/services/context";

let counter = 0;
export async function makeTenant(label = "t"): Promise<{ userId: string; orgId: string; workspaceId: string; ctx: () => Promise<WorkspaceCtx> }> {
  counter++;
  const email = `${label}-${Date.now()}-${counter}@example.com`;
  const user = await signUp({ email, password: "correct horse battery", name: `User ${label}` });
  const { orgId, workspaceId } = await createOrganization(user.id, { orgName: `Org ${label}`, workspaceName: `WS ${label}` });
  return {
    userId: user.id,
    orgId,
    workspaceId,
    ctx: () => withUser(user.id, (tx) => resolveWorkspace(tx, user.id, workspaceId)),
  };
}

/** A tiny deterministic "competitor website" served on 127.0.0.2 (allowlisted for tests only). */
export interface FixtureSite {
  origin: string;
  routes: Map<string, { status?: number; body: string; type?: string; headers?: Record<string, string> }>;
  hits: string[];
  close: () => Promise<void>;
}

export async function startFixtureSite(): Promise<FixtureSite> {
  const routes: FixtureSite["routes"] = new Map();
  const hits: string[] = [];
  const server: Server = createServer((req, res) => {
    hits.push(`${req.method} ${req.url} ua=${req.headers["user-agent"]}`);
    const r = routes.get(req.url ?? "/");
    if (!r) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
      return;
    }
    res.writeHead(r.status ?? 200, { "content-type": r.type ?? "text/html; charset=utf-8", ...(r.headers ?? {}) });
    res.end(r.body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.2", resolve));
  const { port } = server.address() as AddressInfo;
  return { origin: `http://127.0.0.2:${port}`, routes, hits, close: () => new Promise((r) => server.close(() => r())) };
}

export const html = (title: string, main: string) =>
  `<!doctype html><html><head><title>${title}</title></head><body><nav><a href="/pricing">Pricing</a><a href="/features">Features</a><a href="/blog">Blog</a></nav><main>${main}</main><footer>© 2026 Fixture Co</footer></body></html>`;

export async function clearDomainState() {
  await systemDb()`delete from domain_state`;
}
