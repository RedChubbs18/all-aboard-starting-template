// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompletionPrompt } from "@/components/journey/CompletionPrompt";
import { ChartCard, ResponsiveTable } from "@/components/mi/primitives";
import { Markdown } from "./Markdown";

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

describe("CompletionPrompt order (WCAG 1.3.2, 2.4.3)", () => {
  it("puts 'Yes, mark as done' first in the DOM, so Tab order matches the stacked visual order", () => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
    render(<CompletionPrompt open title="Collect your laptop" onYes={() => {}} onNo={() => {}} onClosed={() => {}} />);
    const buttons = screen.getAllByRole("button", { hidden: true }).filter((b) => /mark as done|come back/i.test(b.textContent ?? ""));
    expect(buttons.map((b) => b.textContent)).toEqual(["Yes, mark as done", "Not yet, I'll come back to it"]);
    expect(buttons[0]!.parentElement!.className).not.toMatch(/reverse/);
  });
});

describe("Scrollable tables are keyboard reachable (WCAG 2.1.1)", () => {
  it("ChartCard table view is a focusable, labelled region", () => {
    render(<ChartCard title="Exits by month" items={[{ key: "a", label: "A", value: 1, valueText: "1" }]} headers={["Month", "Exits"]} table={[["Jan", 1]]} />);
    fireEvent.click(screen.getByRole("button", { name: "Show as table" }));
    const region = screen.getByRole("region", { name: "Exits by month" });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region.querySelector("table")).not.toBeNull();
  });

  it("ResponsiveTable wraps the table in a focusable region and gives mobile card titles a heading role", () => {
    render(
      <ResponsiveTable
        caption="Line managers"
        rows={[{ id: "1", n: "Ann" }]}
        rowKey={(r) => r.id}
        columns={[{ key: "n", header: "Name", primary: true, cell: (r) => r.n }]}
        empty={<p>None</p>}
      />,
    );
    expect(screen.getByRole("region", { name: "Line managers" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("heading", { level: 3, name: "Ann", hidden: true })).toBeInTheDocument();
  });

  it("Markdown tables are focusable regions", () => {
    render(<Markdown source={"| A | B |\n|---|---|\n| 1 | 2 |"} />);
    const region = screen.getByRole("region");
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region).toHaveAccessibleName();
  });
});
