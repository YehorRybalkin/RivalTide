import { lookup as dnsLookupCb, type LookupAddress, type LookupOptions } from "node:dns";
import { Agent, fetch, type Response } from "undici";
import { env } from "../env";
import { isAllowlistedPrivateHost, isPublicIp, UnsafeUrlError, validateTargetUrl } from "./url-safety";

export type FetchFailureCode =
  | "blocked_url"
  | "timeout"
  | "network_error"
  | "too_large"
  | "unsupported_content"
  | "too_many_redirects"
  | "http_error"
  | "access_denied"
  | "rate_limited";

export class FetchFailure extends Error {
  constructor(
    message: string,
    public readonly code: FetchFailureCode,
    public readonly status?: number,
    public readonly retryable = false,
    public readonly finalUrl?: string,
  ) {
    super(message);
    this.name = "FetchFailure";
  }
}

export interface FetchResult {
  status: number;
  finalUrl: string;
  contentType: string;
  body: string;
  bytes: number;
  etag: string | null;
  lastModified: string | null;
  notModified: boolean;
  redirects: string[];
  durationMs: number;
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/**
 * DNS lookup used at socket-connect time. Rejects any non-public address, so a
 * hostname that re-resolves to an internal IP after validation (DNS rebinding)
 * still cannot be reached.
 */
export function safeLookup(hostname: string, options: LookupOptions, callback: LookupCallback): void {
  dnsLookupCb(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, []);
    const list = addresses as LookupAddress[];
    const allowPrivate = isAllowlistedPrivateHost(hostname);
    const bad = list.find((a) => !isPublicIp(a.address));
    if (!allowPrivate && (list.length === 0 || bad)) {
      const e = new UnsafeUrlError(`${hostname} resolves to a non-public address`, "private_address") as unknown as NodeJS.ErrnoException;
      e.code = "ERR_UNSAFE_ADDRESS";
      return callback(e, []);
    }
    if (options.all) return callback(null, list);
    const first = list[0]!;
    callback(null, first.address, first.family);
  });
}

let agent: Agent | undefined;
function getAgent(): Agent {
  if (!agent) {
    agent = new Agent({
      connect: { lookup: safeLookup as never, timeout: 10_000 },
      connections: 64,
      keepAliveTimeout: 10_000,
      maxRedirections: 0,
    } as ConstructorParameters<typeof Agent>[0]);
  }
  return agent;
}

const ACCEPTED_TYPES = ["text/html", "application/xhtml+xml", "text/plain"];

export interface SafeFetchOptions {
  etag?: string | null;
  lastModified?: string | null;
  maxBytes?: number;
  accept?: string;
  acceptedTypes?: string[];
  timeoutMs?: number;
}

function charsetOf(contentType: string): string {
  const m = contentType.match(/charset=["']?([\w-]+)/i);
  const cs = (m?.[1] ?? "utf-8").toLowerCase();
  try {
    new TextDecoder(cs);
    return cs;
  } catch {
    return "utf-8";
  }
}

async function readBounded(res: Response, maxBytes: number, finalUrl: string): Promise<{ text: string; bytes: number }> {
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared > maxBytes) {
    await res.body?.cancel().catch(() => {});
    throw new FetchFailure(`Response exceeds ${maxBytes} bytes`, "too_large", res.status, false, finalUrl);
  }
  if (!res.body) return { text: "", bytes: 0 };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new FetchFailure(`Response exceeds ${maxBytes} bytes`, "too_large", res.status, false, finalUrl);
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }
  const decoder = new TextDecoder(charsetOf(res.headers.get("content-type") ?? ""), { fatal: false });
  return { text: decoder.decode(buf), bytes: total };
}

/**
 * Fetches a public URL with SSRF protection, manual redirect re-validation,
 * bounded size/time, and no credentials or cookies forwarded.
 */
export async function safeFetch(input: string, opts: SafeFetchOptions = {}): Promise<FetchResult> {
  const cfg = env();
  const maxBytes = opts.maxBytes ?? cfg.MONITOR_MAX_BYTES;
  const timeoutMs = opts.timeoutMs ?? cfg.MONITOR_TIMEOUT_MS;
  const started = Date.now();
  const redirects: string[] = [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let current: URL;
  try {
    current = validateTargetUrl(input);
  } catch (e) {
    clearTimeout(timer);
    throw new FetchFailure((e as Error).message, "blocked_url");
  }

  try {
    for (let hop = 0; ; hop++) {
      const headers: Record<string, string> = {
        "user-agent": cfg.MONITOR_USER_AGENT,
        accept: opts.accept ?? "text/html,application/xhtml+xml;q=0.9,text/plain;q=0.5",
        "accept-language": "en;q=0.9,*;q=0.5",
      };
      // Conditional headers only apply to the originally requested URL.
      if (hop === 0 && opts.etag) headers["if-none-match"] = opts.etag;
      if (hop === 0 && opts.lastModified) headers["if-modified-since"] = opts.lastModified;

      let res: Response;
      try {
        res = await fetch(current, {
          method: "GET",
          headers,
          redirect: "manual",
          signal: controller.signal,
          dispatcher: getAgent(),
          credentials: "omit",
        } as Parameters<typeof fetch>[1]);
      } catch (e) {
        const err = e as Error & { cause?: { code?: string; name?: string } };
        if (controller.signal.aborted) throw new FetchFailure(`Timed out after ${timeoutMs}ms`, "timeout", undefined, true, current.toString());
        if (err.cause?.code === "ERR_UNSAFE_ADDRESS" || err.cause?.name === "UnsafeUrlError") {
          throw new FetchFailure("Destination resolves to a private or reserved address", "blocked_url", undefined, false, current.toString());
        }
        throw new FetchFailure(`Network error: ${err.cause?.code ?? err.message}`, "network_error", undefined, true, current.toString());
      }

      if (res.status >= 300 && res.status < 400 && res.status !== 304) {
        await res.body?.cancel().catch(() => {});
        const location = res.headers.get("location");
        if (!location) throw new FetchFailure("Redirect without location", "http_error", res.status, false, current.toString());
        if (hop >= cfg.MONITOR_MAX_REDIRECTS) {
          throw new FetchFailure("Too many redirects", "too_many_redirects", res.status, false, current.toString());
        }
        let next: URL;
        try {
          next = validateTargetUrl(new URL(location, current));
        } catch (e) {
          throw new FetchFailure(`Redirect blocked: ${(e as Error).message}`, "blocked_url", res.status, false, location);
        }
        redirects.push(next.toString());
        current = next;
        continue;
      }

      const finalUrl = current.toString();
      const base = {
        status: res.status,
        finalUrl,
        etag: res.headers.get("etag"),
        lastModified: res.headers.get("last-modified"),
        redirects,
      };

      if (res.status === 304) {
        await res.body?.cancel().catch(() => {});
        return { ...base, contentType: "", body: "", bytes: 0, notModified: true, durationMs: Date.now() - started };
      }
      if (res.status === 401 || res.status === 403 || res.status === 451) {
        await res.body?.cancel().catch(() => {});
        throw new FetchFailure(`Access denied (HTTP ${res.status})`, "access_denied", res.status, false, finalUrl);
      }
      if (res.status === 429) {
        await res.body?.cancel().catch(() => {});
        throw new FetchFailure("Rate limited by the website (HTTP 429)", "rate_limited", res.status, true, finalUrl);
      }
      if (res.status >= 400) {
        await res.body?.cancel().catch(() => {});
        throw new FetchFailure(`HTTP ${res.status}`, "http_error", res.status, res.status >= 500, finalUrl);
      }

      const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
      const accepted = opts.acceptedTypes ?? ACCEPTED_TYPES;
      if (contentType && !accepted.some((t) => contentType.includes(t))) {
        await res.body?.cancel().catch(() => {});
        throw new FetchFailure(`Unsupported content type: ${contentType.split(";")[0]}`, "unsupported_content", res.status, false, finalUrl);
      }
      const { text, bytes } = await readBounded(res, maxBytes, finalUrl);
      return { ...base, contentType, body: text, bytes, notModified: false, durationMs: Date.now() - started };
    }
  } catch (e) {
    if (e instanceof FetchFailure) throw e;
    if (controller.signal.aborted) throw new FetchFailure(`Timed out after ${timeoutMs}ms`, "timeout", undefined, true, current.toString());
    throw new FetchFailure(`Network error: ${(e as Error).message}`, "network_error", undefined, true, current.toString());
  } finally {
    clearTimeout(timer);
  }
}
