"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/auth/client";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { cn } from "@/components/ui/cn";
import { isWidePath, shellNav } from "./nav";
import { ProfileMenu } from "./ProfileMenu";

/**
 * Landmarks: skip link, <header>, <nav aria-label="Main"> (bottom bar), <main id="main">.
 * Starter and buddy routes sit in a 430px column on the #e6e8e6 outer background; /lm, /mi and /admin use a wider container.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, status } = useSession();
  const pathname = usePathname();
  const signedIn = status === "authenticated" && !!user;
  const { bar, more } = shellNav(signedIn ? user : null);
  const wide = isWidePath(pathname);
  const first = user?.displayName.trim().split(/\s+/)[0] ?? "";
  const shown = [...bar, ...more];
  const matches = (h: string) => pathname === h || pathname.startsWith(`${h}/`);
  // Only the most specific nav item is current (/admin/simulate must not also highlight /admin).
  const isActive = (href: string) => matches(href) && !shown.some((n) => n.href.length > href.length && matches(n.href));

  return (
    <div className={cn("min-h-screen", wide ? "bg-page" : "bg-outer")}>
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-card px-4 py-2 text-brand-strong focus:not-sr-only focus:fixed focus:left-2 focus:top-2"
      >
        Skip to main content
      </a>
      <div className={cn("relative mx-auto flex min-h-screen flex-col bg-page", wide ? "max-w-[1200px]" : "max-w-[430px]")}>
        {signedIn && (
          <header className="sticky top-0 z-40 border-b border-line bg-card px-4 pb-3 pt-3">
            <div className="grid grid-cols-[44px_1fr_44px] items-center gap-2">
              <NotificationBell align="left" />
              <p className="truncate text-center text-lg font-bold">Hi {first}</p>
              <ProfileMenu more={more} />
            </div>
          </header>
        )}
        <main id="main" tabIndex={-1} className={cn("flex-1 px-4 pb-[110px] pt-5", !signedIn && "flex flex-col justify-center")}>
          {children}
        </main>
        {bar.length > 0 && (
          <nav aria-label="Main" className={cn("fixed bottom-0 z-40 border-t border-line bg-card", wide ? "inset-x-0" : "left-1/2 w-full max-w-[430px] -translate-x-1/2")}>
            <ul className={cn("mx-auto grid px-2 pb-3.5 pt-2", wide ? "max-w-[560px]" : "max-w-[430px]")} style={{ gridTemplateColumns: `repeat(${bar.length}, minmax(0, 1fr))` }}>
              {bar.map(({ href, label, Icon }) => {
                const active = isActive(href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-sm text-xs",
                        active ? "font-bold text-dark-green" : "text-muted",
                      )}
                    >
                      <Icon aria-hidden className="size-[22px]" strokeWidth={active ? 2 : 1.8} />
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
      </div>
    </div>
  );
}
