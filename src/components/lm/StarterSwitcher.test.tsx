// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StarterSwitcher } from "./StarterSwitcher";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/auth/use-api", () => ({
  useApi: () => ({
    data: { starters: [{ id: "a", starterName: "Ada" }, { id: "b", starterName: "Grace" }], past: [] },
  }),
}));

afterEach(cleanup);

describe("StarterSwitcher (WCAG 3.2.2)", () => {
  it("only navigates when Go is pressed", () => {
    render(<StarterSwitcher currentId="a" />);
    fireEvent.change(screen.getByLabelText("Switch starter"), { target: { value: "b" } });
    expect(push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(push).toHaveBeenCalledWith("/lm/starters/b");
  });
});
