import { existsSync } from "node:fs";
import path from "node:path";

/** Loads .env.local / .env for CLI scripts (Next.js does this itself for the web app). */
export function loadEnvFile() {
  for (const f of [".env.local", ".env"]) {
    const p = path.resolve(process.cwd(), f);
    if (existsSync(p)) process.loadEnvFile(p);
  }
}
