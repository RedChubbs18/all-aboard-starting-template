// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BuddyView } from "./BuddyView";
import type { BuddyResponse } from "./buddy-types";

vi.mock("next/link", () => ({ default: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));
vi.mock("@/lib/auth/client", () => ({ useSession: () => ({ apiFetch: vi.fn() }) }));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
const useApi = vi.fn();
vi.mock("@/lib/auth/use-api", () => ({ useApi: (p: string) => useApi(p) }));

const starter = (id: string, name: string) => ({ journeyId: id, name, upn: `${id}@example.test`, stage: "DAY_0" as const, status: "active" as const, progressPercent: 40, startDate: "2026-12-01" });
const data: BuddyResponse = { starters: [starter("j1", "Ada Lovelace"), starter("j2", "Grace Hopper")], selectedId: "j1", tasks: [] };

afterEach(cleanup);

describe("BuddyView starter select (WCAG 3.2.2)", () => {
  it("does not navigate on change; the Show button does", () => {
    useApi.mockReturnValue({ data, error: null, loading: false, reload: vi.fn() });
    const onSelect = vi.fn();
    render(<BuddyView journeyId="j1" onSelect={onSelect} />);
    fireEvent.change(screen.getByLabelText("Starter"), { target: { value: "j2" } });
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(onSelect).toHaveBeenCalledWith("j2");
  });

  it("keeps the select mounted (and focused) while the next starter loads", () => {
    useApi.mockReturnValue({ data, error: null, loading: false, reload: vi.fn() });
    const { rerender } = render(<BuddyView journeyId="j1" onSelect={vi.fn()} />);
    const show = screen.getByRole("button", { name: "Show" });
    show.focus();
    useApi.mockReturnValue({ data: null, error: null, loading: true, reload: vi.fn() });
    rerender(<BuddyView journeyId="j2" onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Show" })).toBe(show);
    expect(show).toHaveFocus();
    expect(screen.getByLabelText("Starter")).toBeInTheDocument();
  });
});
