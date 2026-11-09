import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

// Fresh SQLite file for DB-backed tests (service layer, seed). The file is deleted first, so no reset flag is needed.
export default function setup() {
  for (const f of ["prisma/test.db", "prisma/test.db-journal"]) rmSync(f, { force: true });
  execSync("npx prisma db push --skip-generate", {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
  });
}
