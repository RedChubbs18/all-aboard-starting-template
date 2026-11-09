import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HR Portal (demo simulation)",
  description: "Demo simulation of an HR system for the MyJourney hackathon demo. Not Workday.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body className="min-h-screen antialiased">
        <div role="note" className="bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-950 border-b border-amber-300">
          Demo simulation of an HR system for the MyJourney hackathon demo. Not Workday.
        </div>
        <header className="bg-slate-800 text-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <span className="text-lg font-semibold tracking-tight">People &amp; Talent Portal</span>
            <span className="text-sm text-slate-300">Recruiting (demo)</span>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
