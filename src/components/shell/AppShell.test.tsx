// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/lib/auth/roles";

let current: { status: string; user: SessionUser | null } = { status: "authenticated", user: null };
let path = "/journey";

vi.mock("next/navigation", () => ({ usePathname: () => path }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/auth/client", () => ({
  useSession: () => ({ ...current, mode: "demo", signOut: vi.fn() }),
}));
vi.mock("@/components/notifications/NotificationBell", () => ({ NotificationBell: () => <button type="button">Notifications</button> }));

import { AppShell } from "./AppShell";
import { isFullWidthPath } from "./nav";

const starter: SessionUser = { id: "u1", displayName: "Sam Starter", upn: "sam@example.test", roles: ["STARTER"], teamId: null };
const admin: SessionUser = { id: "u2", displayName: "Ada Admin", upn: "ada@example.test", roles: ["ADMIN"], teamId: null };

afterEach(cleanup);

describe("AppShell navigation by breakpoint", () => {
  it("renders a side nav from 768px (md) and a bottom nav below it, never both", () => {
    current = { status: "authenticated", user: starter };
    render(
      <AppShell>
        <p>content</p>
      </AppShell>,
    );
    const side = screen.getByTestId("side-nav");
    const bottom = screen.getByTestId("bottom-nav");
    // Side nav: hidden by default, flex from md. Bottom nav: visible by default, hidden from md.
    expect(side).toHaveClass("hidden", "md:flex");
    expect(bottom).toHaveClass("md:hidden");
    expect(bottom).not.toHaveClass("hidden");
    // The 430px phone column is gone and content sits beside the side nav.
    expect(document.querySelector('[class*="max-w-[430px]"]')).toBeNull();
    expect(screen.getByRole("main").parentElement).toHaveClass("md:pl-[15rem]");
  });

  it("lists every role item plus Accessibility and display in the side nav, and four on the bottom bar", () => {
    current = { status: "authenticated", user: starter };
    render(<AppShell>x</AppShell>);
    const side = within(screen.getByTestId("side-nav"));
    for (const name of ["Home", "Team", "Checklist", "Support", "Accessibility and display"]) {
      expect(side.getByRole("link", { name })).toBeInTheDocument();
    }
    expect(within(screen.getByTestId("bottom-nav")).getAllByRole("link")).toHaveLength(4);
  });

  it("shows role-based items: an admin gets Admin and Simulate in the side nav", () => {
    current = { status: "authenticated", user: admin };
    path = "/admin";
    render(<AppShell>x</AppShell>);
    const side = within(screen.getByTestId("side-nav"));
    expect(side.getByRole("link", { name: "Admin" })).toHaveAttribute("aria-current", "page");
    expect(side.getByRole("link", { name: "Simulate" })).toBeInTheDocument();
    expect(side.queryByRole("link", { name: "Record exit" })).toBeNull();
    path = "/journey";
  });

  it("renders neither navigation when signed out", () => {
    current = { status: "unauthenticated", user: null };
    render(<AppShell>sign in</AppShell>);
    expect(screen.queryByTestId("side-nav")).toBeNull();
    expect(screen.queryByTestId("bottom-nav")).toBeNull();
  });

  it("uses the wide container only for multi-column pages", () => {
    expect(["/journey", "/team", "/faq", "/lm", "/lm/starters/1", "/mi", "/admin/teams"].every(isFullWidthPath)).toBe(true);
    expect(["/journey/goals", "/journey/task/5", "/content/x", "/settings/accessibility"].some(isFullWidthPath)).toBe(false);
  });
});
