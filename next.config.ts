import type { NextConfig } from "next";

// LAN access in dev (npm run dev:lan): Next.js blocks cross-origin dev requests
// unless the host is listed. Set ALLOWED_DEV_ORIGINS in .env, comma-separated,
// e.g. ALLOWED_DEV_ORIGINS=192.168.1.50,my-laptop.local
const allowedDevOrigins = (process.env.ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * Baseline security headers (L7). The CSP deliberately has no script-src/style-src yet: Next dev (inline
 * runtime, eval for HMR), the production build's inline bootstrap scripts and the MSAL redirect flow would
 * all need verifying with nonces first. frame-ancestors 'self' + X-Frame-Options SAMEORIGIN stop cross-site clickjacking;
 * frame-src allows our own origin and login.microsoftonline.com (MSAL silent token renewal uses a hidden
 * iframe that returns to our redirect URI; blocking it caused a sign-in redirect loop) plus YouTube for the FR-4.6 video; the IFrame API script
 * loads under the absent script-src. MSAL's hidden-iframe silent renewal is then blocked too, and the app already falls back to a redirect.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-src 'self' https://login.microsoftonline.com https://www.youtube-nocookie.com https://www.youtube.com" },
];

const nextConfig: NextConfig = {
  allowedDevOrigins,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
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
