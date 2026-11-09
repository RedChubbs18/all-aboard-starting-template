import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth/client";
import { AppShell } from "@/components/shell/AppShell";
import { BRAND } from "@/lib/brand";
import { ServiceWorkerRegister } from "@/components/shell/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: { default: "MyJourney", template: "%s | MyJourney" },
  description: "Your onboarding journey, from offer to day 30.",
  manifest: "/manifest.webmanifest",
  icons: { icon: BRAND.favicon },
  appleWebApp: { capable: true, title: "MyJourney", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b3b2b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className="h-full antialiased">
      {process.env.NEXT_PUBLIC_BRAND_FONTS === "local" ? (
        <head>
          {/* Licensed GT Ultra, local only (see public/fonts/gt-ultra.css and docs/DECISIONS.md D18). */}
          <link rel="stylesheet" href="/fonts/gt-ultra.css" />
        </head>
      ) : null}
      <body className="min-h-full">
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
