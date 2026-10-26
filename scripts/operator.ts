/** Grants operator access (internal cost/reliability dashboard): npm run operator:grant -- you@company.com */
import { loadEnvFile } from "./load-env";
loadEnvFile();
const { systemDb, closeDb } = await import("../src/server/db");
const email = process.argv[2];
if (!email) throw new Error("Usage: npm run operator:grant -- <email>");
const rows = await systemDb()`update users set is_operator = true where email = ${email} returning id`;
console.log(rows.length ? `Granted operator access to ${email}` : `No user with email ${email}`);
await closeDb();
