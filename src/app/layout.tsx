import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth/client";
import { AppShell } from "@/components/shell/AppShell";
import { BRAND } from "@/lib/brand";
import { PREFERENCES_INIT_SCRIPT } from "@/lib/preferences/prefs";
import { PreferencesSync } from "@/lib/preferences/use-preferences";
import { ServiceWorkerRegister } from "@/components/shell/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: { default: "MyJourney", template: "%s | MyJourney" },
  description: "Your onboarding journey, from offer to day 30.",
  manifest: "/manifest.webmanifest",
  icons: { icon: [...BRAND.icons.icon], apple: [...BRAND.icons.apple] },
  appleWebApp: { capable: true, title: "MyJourney", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#024731",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The inline script sets data-* attributes on <html> before first paint, so React must not treat them as a mismatch.
    <html lang="en-GB" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFERENCES_INIT_SCRIPT }} />
        {/* Licensed GT Ultra, local only (see public/fonts/gt-ultra.css and docs/DECISIONS.md D18). */}
        {/* eslint-disable-next-line @next/next/no-css-tags */}
        {process.env.NEXT_PUBLIC_BRAND_FONTS === "local" ? <link rel="stylesheet" href="/fonts/gt-ultra.css" /> : null}
      </head>
      <body className="min-h-full">
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
        <PreferencesSync />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
