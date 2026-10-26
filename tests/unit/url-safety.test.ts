import { describe, expect, it } from "vitest";
import { isPublicIp, normalizeUserUrl, UnsafeUrlError, validateTargetUrl, assertResolvesPublic } from "@/server/monitoring/url-safety";

describe("isPublicIp", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "0.0.0.0",
    "100.64.0.1", "224.0.0.1", "255.255.255.255", "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1",
    "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:10.0.0.1", "64:ff9b::a00:1", "2002:7f00:1::", "ff02::1",
  ])("rejects %s", (ip) => expect(isPublicIp(ip)).toBe(false));
  it.each(["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700:4700::1111", "::ffff:8.8.8.8"])("accepts %s", (ip) =>
    expect(isPublicIp(ip)).toBe(true));
});

describe("validateTargetUrl", () => {
  const bad = [
    "file:///etc/passwd", "ftp://example.com", "gopher://example.com", "javascript:alert(1)",
    "http://localhost/", "http://foo.localhost/", "http://127.0.0.1/", "http://[::1]/", "http://169.254.169.254/latest/meta-data",
    "http://2130706433/", "http://0x7f.0.0.1/", "http://user:pass@example.com/", "http://example.com:22/",
    "http://metadata.google.internal/", "http://intranet/", "http://printer.local/", "http://10.0.0.5:8080/",
    "http://[::ffff:127.0.0.1]/", "not a url",
  ];
  it.each(bad)("rejects %s", (u) => expect(() => validateTargetUrl(u)).toThrow(UnsafeUrlError));
  it.each(["https://example.com", "http://example.com:8080/pricing", "https://www.example.co.uk/a?b=c"])("accepts %s", (u) =>
    expect(validateTargetUrl(u).toString()).toContain("example"));
  it("normalizes user input and strips fragments", () => {
    expect(normalizeUserUrl(" example.com/pricing#plans ")).toBe("https://example.com/pricing");
  });
  it("rejects hostnames that resolve to private addresses", async () => {
    await expect(assertResolvesPublic("localhost")).rejects.toThrow(UnsafeUrlError);
  });
});
