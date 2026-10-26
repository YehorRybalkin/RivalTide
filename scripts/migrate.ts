/* Versioned SQL migration runner. Usage: npm run db:migrate [-- --reset] */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

export async function migrate(databaseUrl: string, opts: { reset?: boolean; log?: boolean } = {}) {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  const log = opts.log ?? true;
  try {
    if (opts.reset) {
      if (process.env.NODE_ENV === "production") throw new Error("Refusing to reset a production database");
      await sql.unsafe(`drop schema public cascade; create schema public; grant all on schema public to public;`);
      if (log) console.log("Schema reset.");
    }
    await sql`create table if not exists schema_migrations (version text primary key, applied_at timestamptz not null default now())`;
    const dir = path.resolve(import.meta.dirname, "../migrations");
    const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
    const applied = new Set((await sql<{ version: string }[]>`select version from schema_migrations`).map((r) => r.version));
    for (const file of files) {
      if (applied.has(file)) continue;
      const body = await readFile(path.join(dir, file), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`insert into schema_migrations (version) values (${file})`;
      });
      if (log) console.log(`Applied ${file}`);
    }
    if (log) console.log("Migrations up to date.");
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const { loadEnvFile } = await import("./load-env");
  loadEnvFile();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  await migrate(url, { reset: process.argv.includes("--reset") });
}
