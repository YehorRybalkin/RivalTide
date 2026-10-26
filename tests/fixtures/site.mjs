// Deterministic fixture "competitor website" for end-to-end tests.
// GET /__version?v=2 switches content version (test control endpoint).
import { createServer } from "node:http";

const port = Number(process.env.FIXTURE_PORT ?? 4599);
const host = process.env.FIXTURE_HOST ?? "127.0.0.2";
let version = 1;

const layout = (title, main) => `<!doctype html><html><head><title>${title}</title><meta name="description" content="Fixture Analytics is a fictional test company."></head>
<body><nav><a href="/">Home</a><a href="/pricing">Pricing</a><a href="/features">Features</a><a href="/blog">Blog</a></nav><main>${main}</main>
<div id="cookie-banner"><p>We use cookies</p><button>Accept all</button></div><footer>© 2026 Fixture Analytics</footer></body></html>`;

const pages = {
  "/": () => layout("Fixture Analytics — Home", `<h1>${version === 1 ? "Analytics for growing teams" : "The AI analytics platform for agencies"}</h1><p>Rendered at ${new Date().toISOString()}</p><p>Understand your customers.</p>`),
  "/pricing": () => layout("Pricing — Fixture Analytics", `<h1>Pricing</h1>
    <section><h3>Starter</h3><p>€9</p><p>per month</p></section>
    <section><h3>Growth</h3><p>${version === 1 ? "€29" : "€39"}</p><p>per month</p></section>
    <section><h3>Scale</h3><p>€99</p><p>per month</p></section>`),
  "/features": () => layout("Features — Fixture Analytics", `<h1>Features</h1><h2>Dashboards</h2><p>See everything.</p>`),
  "/blog": () => layout("Blog — Fixture Analytics", `<h1>Blog</h1><h2>Hello world</h2><p>First post.</p>`),
};

createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${host}`);
  if (url.pathname === "/__version") {
    version = Number(url.searchParams.get("v") ?? "1");
    res.writeHead(200, { "content-type": "text/plain" });
    return res.end(`version=${version}`);
  }
  if (url.pathname === "/robots.txt") {
    res.writeHead(200, { "content-type": "text/plain" });
    return res.end("User-agent: *\nDisallow: /private\n");
  }
  const page = pages[url.pathname];
  if (!page) {
    res.writeHead(404, { "content-type": "text/plain" });
    return res.end("not found");
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(page());
}).listen(port, host, () => console.log(`fixture site on http://${host}:${port}`));
