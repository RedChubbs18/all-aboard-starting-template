// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { SeedStarterForm } from "./SeedStarterForm";

vi.mock("next/link", () => ({ default: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));
vi.mock("next/navigation", () => ({ usePathname: () => "/admin/seed" }));
vi.mock("@/lib/auth/use-api", () => ({ useApi: () => ({ data: { teams: [], lms: [], buddies: [], starters: [] }, error: null, loading: false, reload: vi.fn() }) }));
vi.mock("@/lib/auth/client", () => ({ useSession: () => ({ mode: "entra", apiFetch: vi.fn(), user: null, acquireGraphToken: vi.fn() }) }));
vi.mock("@/lib/auth/config", () => ({ graphInvitesEnabled: () => true, graphInviteExternalApproved: () => true }));

beforeAll(() => {
  // jsdom has no modal <dialog> support.
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});
afterEach(cleanup);

describe("SeedStarterForm", () => {
  it("shows an ErrorSummary (focused) for invalid fields", () => {
    render(<SeedStarterForm />);
    fireEvent.click(screen.getByRole("button", { name: /Create journey and send invite/ }));
    const alert = screen.getByRole("alert");
    expect(alert).toHaveFocus();
    expect(alert).toHaveTextContent("Enter a valid personal email address");
  });

  it("confirms the real invite in the shared native dialog and Cancel closes it", () => {
    render(<SeedStarterForm />);
    fireEvent.change(screen.getByLabelText(/Personal email/), { target: { value: "someone@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: /Create journey and send invite/ }));
    const dialog = screen.getByRole("dialog", { name: "Send invitation?" });
    expect(dialog.tagName).toBe("DIALOG");
    expect(dialog).toHaveTextContent("someone@example.test");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Send invitation?" })).not.toBeInTheDocument();
  });
});
