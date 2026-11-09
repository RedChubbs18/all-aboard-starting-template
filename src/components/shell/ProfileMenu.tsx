"use client";

import Link from "next/link";
import { UserRound } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useSession } from "@/lib/auth/client";
import type { ShellNavItem } from "./nav";

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

  const item = "flex min-h-11 w-full items-center gap-2 rounded-sm px-3 text-left text-[15px] font-semibold hover:bg-page";

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Profile and account"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex size-11 items-center justify-center rounded-full border-[1.5px] border-ink bg-card text-ink"
      >
        <UserRound aria-hidden className="size-[22px]" strokeWidth={1.8} />
      </button>
      {open && (
        <section id={panelId} aria-label="Profile" className="absolute right-0 top-full z-50 mt-2 w-64 rounded-md border border-line bg-card p-2 text-ink shadow-card">
          {user && (
            <div className="border-b border-line px-3 pb-2 pt-1">
              <p className="font-bold">{user.displayName}</p>
              <p className="text-sm text-muted">{user.roles.join(", ")}</p>
            </div>
          )}
          {more.length > 0 && (
            <ul className="border-b border-line py-1">
              {more.map(({ href, label, Icon }) => (
                <li key={href}>
                  <Link href={href} onClick={() => setOpen(false)} className={item}>
                    <Icon aria-hidden className="size-5" strokeWidth={1.8} />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={() => void signOut()} className={`${item} mt-1`}>
            {mode === "demo" ? "Switch persona" : "Sign out"}
          </button>
        </section>
      )}
    </div>
  );
}
