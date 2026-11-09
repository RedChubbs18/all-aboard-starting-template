/**
 * tsx does not load `.env` (Next.js and the Prisma CLI do). Import this FIRST in scripts run with tsx.
 * Real environment variables win over `.env`; a missing `.env` is fine (the local dev default is used).
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const file = resolve(process.cwd(), ".env");
if (existsSync(file) && typeof process.loadEnvFile === "function") {
  // loadEnvFile does not override variables that are already set.
  process.loadEnvFile(file);
}
process.env.DATABASE_URL ??= "file:./dev.db";
