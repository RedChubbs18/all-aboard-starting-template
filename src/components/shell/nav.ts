import { BarChart3, ClipboardCheck, CircleHelp, House, Settings, UserRoundCheck, Users, Wrench, LogOut, type LucideIcon } from "lucide-react";
import { hasAnyRole, navFor, type SessionUser } from "@/lib/auth/roles";

/** Presentation of the navigation (icon and short label); which roles see what stays in lib/auth/roles.ts. */
export interface ShellNavItem {
  href: string;
  label: string;
  Icon: LucideIcon;
}

const META: Record<string, { label: string; Icon: LucideIcon; rank: number }> = {
  "/journey": { label: "Home", Icon: House, rank: 10 },
  "/team": { label: "Team", Icon: Users, rank: 20 },
  "/journey/goals": { label: "Checklist", Icon: ClipboardCheck, rank: 30 },
  "/faq": { label: "Support", Icon: CircleHelp, rank: 40 },
  "/lm": { label: "Starters", Icon: UserRoundCheck, rank: 5 },
  "/mi": { label: "MI", Icon: BarChart3, rank: 4 },
  "/admin": { label: "Admin", Icon: Settings, rank: 3 },
  "/admin/journeys": { label: "Record exit", Icon: LogOut, rank: 60 },
  "/admin/simulate": { label: "Simulate", Icon: Wrench, rank: 70 },
};

/** Routes that use the wide container instead of the 430px phone column. */
export const isWidePath = (path: string) => ["/lm", "/mi", "/admin"].some((p) => path === p || path.startsWith(`${p}/`));

/**
 * The bar shows the four most important items for the role; the rest go in the profile menu.
 * Starters and buddies get Home, Team, Checklist, Support (STYLE A.7).
 */
export function shellNav(user: SessionUser | null): { bar: ShellNavItem[]; more: ShellNavItem[] } {
  if (!user) return { bar: [], more: [] };
  const base = navFor(user).map((n) => n.href);
  const hrefs = hasAnyRole(user, "STARTER") ? [...base, "/journey/goals"] : base;
  const items = hrefs
    .filter((h) => META[h])
    .sort((a, b) => (META[a]?.rank ?? 99) - (META[b]?.rank ?? 99))
    .map((href) => ({ href, label: META[href]!.label, Icon: META[href]!.Icon }));
  return { bar: items.slice(0, 4), more: items.slice(4) };
}
