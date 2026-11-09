// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorSummary } from "@/components/lm/error-summary";
import { TaskCard } from "@/components/journey/TaskCard";
import { task } from "@/components/journey/test-data";
import { Button } from "./Button";

vi.mock("next/link", () => ({
  default: ({ children, href, ref, ...rest }: { children: React.ReactNode; href: string; ref?: React.Ref<HTMLAnchorElement> }) => (
    <a href={href} ref={ref} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

describe("Button loading state (WCAG 2.4.3)", () => {
  it("uses aria-disabled, stays focusable and ignores clicks while loading", () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );
    const b = screen.getByRole("button", { name: "Save" });
    expect(b).not.toBeDisabled();
    expect(b).toHaveAttribute("aria-disabled", "true");
    expect(b).toHaveAttribute("aria-busy", "true");
    b.focus();
    expect(b).toHaveFocus();
    fireEvent.click(b);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("runs onClick when not loading", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe("TaskCard Mark done", () => {
  it("includes the visible label in its accessible name (WCAG 2.5.3)", () => {
    const t = task({ key: "a", stage: "DAY_0", title: "Read the welcome pack", type: "INFO" });
    render(
      <ul>
        <TaskCard task={t} onComplete={vi.fn()} />
      </ul>,
    );
    expect(screen.getByRole("button", { name: "Mark done: Read the welcome pack" })).toHaveTextContent("Mark done");
  });

  it("moves focus to the task row before the button unmounts (WCAG 2.4.3)", () => {
    const t = task({ key: "a", stage: "DAY_0", title: "Read the welcome pack", type: "INFO" });
    const onComplete = vi.fn();
    render(
      <ul>
        <TaskCard task={t} onComplete={onComplete} />
      </ul>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Mark done/ }));
    expect(onComplete).toHaveBeenCalledWith(t);
    expect(document.activeElement).toBe(screen.getByRole("link", { name: /Read the welcome pack/ }));
  });
});

describe("ErrorSummary", () => {
  it("is an alert, takes focus and lists field problems", () => {
    render(<ErrorSummary message="Check the fields" items={["Email is required", "Check the fields"]} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveFocus();
    expect(alert).toHaveTextContent("Check the fields");
    expect(screen.getByText("Email is required")).toBeInTheDocument();
  });

  it("re-focuses on a repeated identical failure when focusKey changes", () => {
    const { rerender } = render(<ErrorSummary message="Same" focusKey={1} />);
    const alert = screen.getByRole("alert");
    alert.blur();
    rerender(<ErrorSummary message="Same" focusKey={2} />);
    expect(alert).toHaveFocus();
  });
});
