"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/auth/client";
import { navFor } from "@/lib/auth/roles";
import { NotificationBell } from "@/components/notifications/NotificationBell";

/**
 * Landmarks: skip link, <header>, <nav> (side on md+, bottom bar on mobile), <main id="main">.
 * Nav links are filtered by role. Mobile-first (360px).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, status, mode, signOut } = useSession();
  const pathname = usePathname();
  const items = status === "authenticated" ? navFor(user) : [];

  const link = (href: string, label: string, extra = "") => {
    const matches = (h: string) => pathname === h || pathname.startsWith(`${h}/`);
    // Only the most specific nav item is current (/admin/simulate must not also highlight /admin).
    const active = matches(href) && !items.some((n) => n.href.length > href.length && matches(n.href));
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={`flex min-h-12 items-center justify-center rounded-md px-3 text-sm font-medium md:justify-start ${
          active ? "bg-brand-soft text-brand-strong" : "text-text hover:bg-surface-alt"
        } ${extra}`}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-surface px-4 py-2 text-brand focus:not-sr-only focus:fixed focus:left-2 focus:top-2"
      >
        Skip to main content
      </a>

      <header className="flex items-center justify-between bg-brand-strong px-4 py-3 text-surface md:hidden">
        <Link href="/" className="text-lg font-semibold">All Aboard</Link>
        {status === "authenticated" && (
          <div className="flex items-center gap-1">
            <NotificationBell />
            <button onClick={signOut} className="min-h-11 rounded-md px-3 text-sm underline">
              {mode === "demo" ? "Switch persona" : "Sign out"}
            </button>
          </div>
        )}
      </header>

      {items.length > 0 && (
        <nav
          aria-label="Main"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface md:static md:inset-auto md:w-60 md:shrink-0 md:border-r md:border-t-0"
        >
          <div className="hidden items-center justify-between px-4 py-4 text-lg font-semibold text-brand-strong md:flex">
            <span>All Aboard</span>
            {status === "authenticated" && <NotificationBell align="left" />}
          </div>
          <ul className="flex justify-around gap-1 overflow-x-auto p-1 md:flex-col md:justify-start md:overflow-visible md:p-3">
            {items.map((n) => (
              <li key={n.href} className="min-w-[4.5rem] flex-1 md:min-w-0 md:flex-none">{link(n.href, n.label, "w-full text-center md:text-left")}</li>
            ))}
          </ul>
          {user && (
            <div className="hidden border-t border-border p-4 text-sm md:block">
              <p className="font-medium">{user.displayName}</p>
              <p className="text-text-muted">{user.roles.join(", ")}</p>
              <button onClick={signOut} className="mt-2 min-h-11 text-brand underline">
                {mode === "demo" ? "Switch persona" : "Sign out"}
              </button>
            </div>
          )}
        </nav>
      )}

      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-4xl flex-1 px-4 pb-24 pt-6 md:pb-8">
        {children}
      </main>
    </div>
  );
}
