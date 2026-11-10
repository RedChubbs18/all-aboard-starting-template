import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // `server-only` throws outside the react-server condition; tests run server code directly.
      "server-only": path.resolve(import.meta.dirname, "node_modules/server-only/empty.js"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "prisma/**/*.test.ts"],
    fileParallelism: false,
    globalSetup: ["./vitest.global-setup.ts"],
    // Hermetic: never inherit local .env adapter modes or real keys (no real API calls in tests).
    env: {
      DATABASE_URL: "file:./test.db",
      AUTH_MODE: "",
      DEMO_SESSION_SECRET: "test-secret-test-secret-test-secret",
      ANTHROPIC_API_KEY: "",
      ADAPTER_CHATBOT_MODE: "",
      ADAPTER_PHOTOCHECK_MODE: "",
      ADAPTER_IDENTITY_MODE: "",
      ADAPTER_FIRSTADVANTAGE_MODE: "",
      NEXT_PUBLIC_GRAPH_INVITES: "",
      NEXT_PUBLIC_GRAPH_INVITE_EXTERNAL_APPROVED: "",
      NEXT_PUBLIC_BRAND_ASSETS: "",
      NEXT_PUBLIC_BRAND_FONTS: "",
      DEMO_PIN: "",
      ALLOWED_DEV_ORIGINS: "",
      SEED_SKIP_LOCAL: "1",
      GUEST_CONVERSION: "",
      MYJOURNEY_GRAPH_CLIENT_ID: "",
      MYJOURNEY_GRAPH_CLIENT_SECRET: "",
      MYJOURNEY_MAIL_SENDER_UPN: "",
      MEMBER_UPN_DOMAIN: "",
      WORKDAY_WEBHOOK_SECRET: "",
    },
  },
});
