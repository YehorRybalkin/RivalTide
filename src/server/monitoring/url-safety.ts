import { BlockList, isIP } from "node:net";
import { lookup as dnsLookup } from "node:dns/promises";

/**
 * SSRF protection. Every outbound monitoring request must pass:
 *   1. validateTargetUrl()  – syntactic checks (scheme, credentials, port, host form, IP literals)
 *   2. a connect-time DNS check (see safeLookup in fetcher.ts) that rejects
 *      private/reserved addresses for the *actual* address being connected to,
 *      which also defeats DNS rebinding between validation and connection.
 * Redirect targets are re-validated with the same rules.
 */

export class UnsafeUrlError extends Error {
  constructor(
    message: string,
    public readonly code: "invalid_url" | "scheme" | "credentials" | "port" | "host" | "private_address" | "dns",
  ) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

const blocked = new BlockList();
// IPv4 special-purpose ranges (RFC 6890 and friends)
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // link-local incl. cloud metadata 169.254.169.254
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
] as const) {
  blocked.addSubnet(net, prefix, "ipv4");
}
// IPv6 special-purpose ranges
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96], // NAT64
  ["64:ff9b:1::", 48],
  ["100::", 64], // discard
  ["2001::", 23], // IETF protocol assignments (Teredo, ORCHID, ...)
  ["2001:db8::", 32], // documentation
  ["2002::", 16], // 6to4
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["fec0::", 10], // site-local (deprecated)
  ["ff00::", 8], // multicast
] as const) {
  blocked.addSubnet(net, prefix, "ipv6");
}

const ALLOWED_PORTS = new Set(["", "80", "443", "8080", "8443"]);
const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".localdomain", ".home.arpa", ".lan", ".corp", ".intranet"];
const BLOCKED_HOSTS = new Set(["localhost", "metadata.google.internal", "metadata", "instance-data"]);

/** Extracts an embedded IPv4 address from IPv4-mapped / compatible IPv6 forms. */
function embeddedIPv4(addr: string): string | null {
  const m = addr.toLowerCase().match(/^(?:::ffff:|::)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (m?.[1]) return m[1];
  const hex = addr.toLowerCase().match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex?.[1] && hex[2]) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  return null;
}

export function isPublicIp(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return false;
  if (family === 4) return !blocked.check(address, "ipv4");
  const mapped = embeddedIPv4(address);
  if (mapped) return isPublicIp(mapped);
  if (address.toLowerCase().startsWith("::ffff:")) return false;
  return !blocked.check(address, "ipv6");
}

function privateHostAllowlist(): Set<string> {
  // Development/test escape hatch for fixture servers. Rejected in production by env().
  if (process.env.NODE_ENV === "production") return new Set();
  const raw = process.env.MONITOR_ALLOW_PRIVATE_HOSTS ?? "";
  return new Set(raw.split(",").map((h) => h.trim().toLowerCase()).filter(Boolean));
}

export function isAllowlistedPrivateHost(hostname: string): boolean {
  return privateHostAllowlist().has(hostname.toLowerCase().replace(/^\[|\]$/g, ""));
}

export const MAX_URL_LENGTH = 2048;

/** Normalizes user input ("example.com/pricing") into an absolute URL string, or throws. */
export function normalizeUserUrl(input: string): string {
  let raw = input.trim();
  if (!raw) throw new UnsafeUrlError("URL is required", "invalid_url");
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = `https://${raw}`;
  const url = validateTargetUrl(raw);
  url.hash = "";
  return url.toString();
}

/** Synchronous structural validation. Does not resolve DNS. */
export function validateTargetUrl(input: string | URL): URL {
  const str = typeof input === "string" ? input : input.toString();
  if (str.length > MAX_URL_LENGTH) throw new UnsafeUrlError("URL is too long", "invalid_url");
  let url: URL;
  try {
    url = new URL(str);
  } catch {
    throw new UnsafeUrlError("Not a valid URL", "invalid_url");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("Only http and https URLs can be monitored", "scheme");
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError("URLs containing credentials are not allowed", "credentials");
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) throw new UnsafeUrlError("URL has no host", "host");
  const allowlisted = isAllowlistedPrivateHost(host);
  if (!ALLOWED_PORTS.has(url.port) && !allowlisted) {
    throw new UnsafeUrlError("Only standard web ports (80, 443, 8080, 8443) are allowed", "port");
  }
  if (allowlisted) return url;

  if (isIP(host)) {
    if (!isPublicIp(host)) throw new UnsafeUrlError("This address is private or reserved", "private_address");
    return url;
  }
  // Reject numeric forms that some resolvers interpret as IPs (e.g. "2130706433", "0x7f.1").
  if (/^[0-9.]+$/.test(host) || /^0x[0-9a-f]+/i.test(host) || /(^|\.)0x[0-9a-f]+(\.|$)/i.test(host)) {
    throw new UnsafeUrlError("Numeric host names are not allowed", "host");
  }
  if (BLOCKED_HOSTS.has(host) || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new UnsafeUrlError("Internal host names are not allowed", "host");
  }
  if (!host.includes(".")) throw new UnsafeUrlError("Host must be a fully qualified domain name", "host");
  if (!/^[a-z0-9.-]+$/.test(host)) throw new UnsafeUrlError("Host contains invalid characters", "host");
  return url;
}

/** Resolves a host and asserts all addresses are public. Used for early, user-facing validation. */
export async function assertResolvesPublic(hostname: string): Promise<string[]> {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (isAllowlistedPrivateHost(host)) return [host];
  if (isIP(host)) {
    if (!isPublicIp(host)) throw new UnsafeUrlError("This address is private or reserved", "private_address");
    return [host];
  }
  let records: { address: string }[];
  try {
    records = await dnsLookup(host, { all: true, verbatim: true });
  } catch {
    throw new UnsafeUrlError(`Could not resolve ${host}`, "dns");
  }
  if (records.length === 0) throw new UnsafeUrlError(`Could not resolve ${host}`, "dns");
  for (const r of records) {
    if (!isPublicIp(r.address)) {
      throw new UnsafeUrlError(`${host} resolves to a private or reserved address`, "private_address");
    }
  }
  return records.map((r) => r.address);
}

export function hostOf(url: string | URL): string {
  return (typeof url === "string" ? new URL(url) : url).hostname.toLowerCase();
}

/** Registrable-domain approximation used to keep suggested pages on the competitor's own site. */
export function sameSite(a: string | URL, b: string | URL): boolean {
  const strip = (h: string) => h.replace(/^www\./, "");
  return strip(hostOf(a)) === strip(hostOf(b));
}
