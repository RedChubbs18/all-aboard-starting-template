"use client";

import Link from "next/link";
import { UserRound } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useSession } from "@/lib/auth/client";
import { ACCESSIBILITY_ITEM, type ShellNavItem } from "./nav";

const A11yIcon = ACCESSIBILITY_ITEM.Icon;

/** Right-hand profile circle: opens the persona switch / sign out menu, plus any nav items that don't fit the bottom bar. */
export function ProfileMenu({ more }: { more: ShellNavItem[] }) {
  const { user, mode, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const item = "flex min-h-11 w-full items-center gap-2 rounded-sm px-3 text-left text-[0.9375rem] font-semibold hover:bg-page";

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Profile and account"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex size-11 items-center justify-center rounded-full border border-ink bg-card text-ink hover:bg-page"
      >
        <UserRound aria-hidden className="size-[22px]" strokeWidth={1.8} />
      </button>
      {open && (
        <section id={panelId} aria-label="Profile" className="absolute right-0 top-full z-50 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-md border border-line bg-card p-2 text-ink shadow-card">
          {user && (
            <div className="border-b border-line px-3 pb-2 pt-1">
              <p className="font-bold">{user.displayName}</p>
              <p className="text-sm text-muted">{user.roles.join(", ")}</p>
            </div>
          )}
          <ul className="border-b border-line py-1">
            {/* Items that did not fit the phone bottom bar. From 768px the side navigation lists every item. */}
            {more.map(({ href, label, Icon }) => (
              <li key={href} className="md:hidden">
                <Link href={href} onClick={() => setOpen(false)} className={item}>
                  <Icon aria-hidden className="size-5" strokeWidth={1.8} />
                  {label}
                </Link>
              </li>
            ))}
            <li>
              <Link href={ACCESSIBILITY_ITEM.href} onClick={() => setOpen(false)} className={item}>
                <A11yIcon aria-hidden className="size-5" strokeWidth={1.8} />
                {ACCESSIBILITY_ITEM.label}
              </Link>
            </li>
          </ul>
          <button type="button" onClick={() => void signOut()} className={`${item} mt-1`}>
            {mode === "demo" ? "Switch persona" : "Sign out"}
          </button>
        </section>
      )}
    </div>
  );
}
