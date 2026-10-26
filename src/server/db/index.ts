import postgres from "postgres";
import { env } from "../env";

export type Sql = postgres.Sql<{}>;
export type Tx = postgres.TransactionSql<{}>;
export type Db = Sql | Tx;

const g = globalThis as unknown as { __rivaltideSql?: Sql };

/**
 * System connection (owner role). Bypasses RLS: use only for worker jobs,
 * auth bootstrap, webhooks and operator tooling — never with unvalidated
 * tenant identifiers.
 */
export function systemDb(): Sql {
  if (!g.__rivaltideSql) {
    g.__rivaltideSql = postgres(env().DATABASE_URL, {
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      idle_timeout: 30,
      connect_timeout: 15,
      transform: postgres.camel,
      onnotice: () => {},
      // Supabase's transaction pooler (port 6543) does not support prepared statements.
      prepare: process.env.DATABASE_PREPARE !== "false",
    });
  }
  return g.__rivaltideSql;
}

/**
 * Runs `fn` in a transaction as the RLS-restricted `rivaltide_app` role with
 * `app.user_id` set. Every tenant-facing read and write goes through here.
 */
export async function withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const result = await systemDb().begin(async (tx) => {
    await tx`select set_config('app.user_id', ${userId}, true)`;
    await tx`set local role rivaltide_app`;
    return fn(tx);
  });
  return result as T;
}

export async function closeDb(): Promise<void> {
  if (g.__rivaltideSql) {
    await g.__rivaltideSql.end({ timeout: 5 });
    g.__rivaltideSql = undefined;
  }
}
