"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/auth/client";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { cn } from "@/components/ui/cn";
import { ACCESSIBILITY_ITEM, isFullWidthPath, shellNav } from "./nav";
import { ProfileMenu } from "./ProfileMenu";

/**
 * Responsive shell (D34). Landmarks: skip link, <header>, <nav aria-label="Main">, <main id="main">.
 *  - Below 768px (`md`): sticky header with the logo, and a fixed bottom navigation bar of the role's four main items.
 *  - 768px and up: a persistent left side navigation (logo, every role item, Accessibility and display) and a top bar
 *    with the greeting, notifications and profile. The bottom bar is not rendered for assistive technology (`md:hidden`).
 * Content sits in a fluid container: up to 1280px for pages with their own columns, a 768px reading column otherwise.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, status } = useSession();
  const pathname = usePathname();
  const signedIn = status === "authenticated" && !!user;
  const { bar, more } = shellNav(signedIn ? user : null);
  const full = isFullWidthPath(pathname);
  const first = user?.displayName.trim().split(/\s+/)[0] ?? "";
  const A11yIcon = ACCESSIBILITY_ITEM.Icon;
  const shown = [...bar, ...more, ACCESSIBILITY_ITEM];
  const matches = (h: string) => pathname === h || pathname.startsWith(`${h}/`);
  // Only the most specific nav item is current (/admin/simulate must not also highlight /admin).
  const isActive = (href: string) => matches(href) && !shown.some((n) => n.href.length > href.length && matches(n.href));

  return (
    <div className="min-h-screen bg-page">
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-card px-4 py-2 text-brand-strong focus:not-sr-only focus:fixed focus:left-2 focus:top-2"
      >
        Skip to main content
      </a>

      {signedIn && (
        <div
          data-testid="side-nav"
          className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col overflow-y-auto border-r border-line bg-card md:flex"
        >
          <Link href="/" aria-label="MyJourney home" className="m-4 inline-flex min-h-11 items-center self-start">
            <BrandLogo height={40} />
          </Link>
          <nav aria-label="Main" className="flex-1">
            <ul className="space-y-1 py-2">
              {[...bar, ...more].map(({ href, label, Icon }) => {
                const active = isActive(href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex min-h-11 items-center gap-3 border-l-4 px-4 py-2 text-[0.9375rem]",
                        active ? "border-brand bg-page font-bold text-ink" : "border-transparent text-muted hover:bg-page hover:text-ink",
                      )}
                    >
                      <Icon aria-hidden className="size-5 shrink-0" strokeWidth={active ? 2.2 : 1.8} />
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="border-t border-line py-2">
            <Link
              href={ACCESSIBILITY_ITEM.href}
              aria-current={isActive(ACCESSIBILITY_ITEM.href) ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 border-l-4 px-4 py-2 text-[0.9375rem]",
                isActive(ACCESSIBILITY_ITEM.href) ? "border-brand bg-page font-bold text-ink" : "border-transparent text-muted hover:bg-page hover:text-ink",
              )}
            >
              <A11yIcon aria-hidden className="size-5 shrink-0" strokeWidth={1.8} />
              {ACCESSIBILITY_ITEM.label}
            </Link>
          </div>
        </div>
      )}

      <div className={cn("flex min-h-screen flex-col", signedIn && "md:pl-60")}>
        {signedIn && (
          <header className="sticky top-0 z-40 border-b border-line bg-card px-4 py-3 md:px-8">
            <div className={cn("mx-auto flex items-center gap-2", full ? "max-w-[1280px]" : "max-w-3xl")}>
              <Link href="/" aria-label="MyJourney home" className="inline-flex shrink-0 items-center md:hidden">
                <BrandLogo height={32} className="text-base" />
              </Link>
              <p className="font-display hidden min-w-0 flex-1 truncate text-lg font-bold min-[400px]:block md:text-xl">Hi {first}</p>
              <span className="flex-1 min-[400px]:hidden" aria-hidden />
              <NotificationBell />
              <ProfileMenu more={more} />
            </div>
          </header>
        )}
        <main
          id="main"
          tabIndex={-1}
          className={cn(
            "flex-1 px-4 pt-5 md:px-8 md:pt-8",
            bar.length > 0 ? "pb-[110px] md:pb-10" : "pb-10",
            !signedIn && "flex flex-col items-center justify-center",
          )}
        >
          <div className={cn("mx-auto w-full", signedIn ? (full ? "max-w-[1280px]" : "max-w-3xl") : "max-w-[460px]")}>{children}</div>
        </main>
        {bar.length > 0 && (
          <nav aria-label="Main" data-testid="bottom-nav" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card md:hidden">
            <ul className="mx-auto grid max-w-[560px] px-2 pb-3.5 pt-2" style={{ gridTemplateColumns: `repeat(${bar.length}, minmax(0, 1fr))` }}>
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
