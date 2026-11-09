import type { NextConfig } from "next";

// LAN access in dev (npm run dev:lan): Next.js blocks cross-origin dev requests
// unless the host is listed. Set ALLOWED_DEV_ORIGINS in .env, comma-separated,
// e.g. ALLOWED_DEV_ORIGINS=192.168.1.50,my-laptop.local
const allowedDevOrigins = (process.env.ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  allowedDevOrigins,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
