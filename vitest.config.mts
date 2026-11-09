import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "prisma/**/*.test.ts"],
    fileParallelism: false,
    globalSetup: ["./vitest.global-setup.ts"],
    env: { DATABASE_URL: "file:./test.db", AUTH_MODE: "", DEMO_SESSION_SECRET: "test-secret-test-secret-test-secret" },
  },
});
