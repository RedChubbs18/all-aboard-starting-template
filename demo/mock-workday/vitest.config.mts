import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Hermetic: never inherit a local .env.
    env: { WORKDAY_WEBHOOK_SECRET: "", NEXT_PUBLIC_GRAPH_INVITE_EXTERNAL_APPROVED: "" },
  },
});
