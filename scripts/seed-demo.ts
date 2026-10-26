/** Creates a demo account with fictional data and prints its workspace id (local development helper). */
import { loadEnvFile } from "./load-env";
loadEnvFile();
const { createDemoAccount } = await import("../src/server/demo/seed");
const { closeDb } = await import("../src/server/db");
const r = await createDemoAccount();
console.log(`Demo workspace created: /app/${r.workspaceId} (sign in via “Explore Live Demo” to view a fresh one)`);
await closeDb();
