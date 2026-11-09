import { ROLES, type Role } from "@/domain/types";

export { ROLES };
export type { Role };

/** Shape returned by /api/me and used by useSession(). */
export interface SessionUser {
  id: string;
  displayName: string;
  upn: string;
  roles: Role[];
  teamId: string | null;
}

export const hasAnyRole = (user: { roles: readonly Role[] } | null | undefined, ...roles: Role[]): boolean =>
  !!user && roles.some((r) => user.roles.includes(r));

export const parseRoles = (v: unknown): Role[] =>
  Array.isArray(v) ? v.filter((r): r is Role => (ROLES as readonly string[]).includes(String(r))) : [];

export interface NavItem {
  href: string;
  label: string;
  roles: Role[];
}

/** Single source of truth for navigation and page guards. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/journey", label: "My journey", roles: ["STARTER", "BUDDY", "LM", "PNP", "ADMIN"] },
  { href: "/team", label: "My team", roles: ["STARTER", "BUDDY", "LM", "PNP", "ADMIN"] },
  { href: "/faq", label: "Help", roles: ["STARTER", "BUDDY", "LM", "PNP", "ADMIN"] },
  { href: "/lm", label: "My starters", roles: ["LM", "PNP", "ADMIN"] },
  { href: "/mi", label: "MI", roles: ["PNP", "ADMIN"] },
  { href: "/admin", label: "Admin", roles: ["ADMIN"] },
];

export const navFor = (user: { roles: readonly Role[] } | null) =>
  NAV_ITEMS.filter((n) => hasAnyRole(user, ...n.roles));

/** Where to land after sign-in. */
export function homePathFor(user: { roles: readonly Role[] }): string {
  if (hasAnyRole(user, "ADMIN")) return "/admin";
  if (hasAnyRole(user, "PNP")) return "/mi";
  if (hasAnyRole(user, "LM")) return "/lm";
  return "/journey";
}
