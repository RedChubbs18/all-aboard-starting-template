import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth/client";
import { AppShell } from "@/components/shell/AppShell";
import { BRAND } from "@/lib/brand";
import { ServiceWorkerRegister } from "@/components/shell/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: { default: "All Aboard", template: "%s | All Aboard" },
  description: "Your onboarding journey, from offer to day 30.",
  manifest: "/manifest.webmanifest",
  icons: { icon: BRAND.favicon },
  appleWebApp: { capable: true, title: "All Aboard", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b3b2b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className="h-full antialiased">
      <body className="min-h-full">
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
