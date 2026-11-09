// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Markdown } from "@/components/ui/Markdown";
import { deriveView } from "./derive";
import { HorseTrack } from "./HorseTrack";
import { task } from "./test-data";
import type { TaskDto } from "./types";

afterEach(cleanup);

/** 4 tasks in stage 1 (gating), `done` of them complete; later stages have one task each. */
function view(done: number, status: "active" | "completed" = "active") {
  const tasks: TaskDto[] = [
    ...[0, 1, 2, 3].map((i) => task({ key: `s1-${i}`, title: `Step ${i}`, stage: "CONDITIONAL_OFFER", status: i < done ? "DONE" : "TODO" })),
    task({ key: "later", stage: "PEV", status: "LOCKED" }),
  ];
  return deriveView({ tasks, currentStage: "CONDITIONAL_OFFER", status }, new Date("2026-11-20T00:00:00Z"));
}

function track(v: ReturnType<typeof view>, extra: Partial<React.ComponentProps<typeof HorseTrack>> = {}) {
  return (
    <HorseTrack
      stages={v.stages}
      progress={v.progress}
      remainingCount={v.remainingCount}
      nextTasks={v.nextTasks}
      projectedFinish={v.projectedFinish}
      completed={v.completed}
      reducedMotion
      {...extra}
    />
  );
}

describe("HorseTrack accessibility", () => {
  it("exposes a progressbar with text equivalent at 0%", () => {
    render(track(view(0)));
    const bar = screen.getByRole("progressbar", { name: "Journey progress" });
    expect(bar).toHaveAttribute("aria-valuenow", "0");
    expect(bar.getAttribute("aria-valuetext")).toMatch(/^0 percent complete\. Stage 1 of 5: Conditional offer\. 0 of 5 tasks done\./);
    const list = screen.getByRole("list", { name: "Journey stages" });
    expect(list.querySelectorAll("li")).toHaveLength(5);
    expect(list.textContent).toContain("Stage 1, Conditional offer. Current, 0 of 4 tasks done.");
    expect(list.textContent).toContain("Locked");
  });

  it("reports a mid-way value (stage fractions averaged)", () => {
    render(track(view(4)));
    const bar = screen.getByRole("progressbar");
    // stage 1 complete (1.0) + others 0 -> 1/5 = 20%
    expect(bar).toHaveAttribute("aria-valuenow", "20");
    expect(bar.getAttribute("aria-valuetext")).toMatch(/20 percent complete\. Stage 1 of 5.*4 of 5 tasks done/);
  });

  it("shows 50%", () => {
    const v = view(2);
    const half = { ...v, progress: 0.5, percent: 50 };
    render(track(half));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
  });

  it("reaches 100% only when completed and caps at 99 otherwise", () => {
    const capped = view(4);
    const { rerender } = render(track({ ...capped, progress: 1 }));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "99");
    rerender(track({ ...capped, progress: 1, completed: true }, { completed: true }));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });

  it("keeps the svg decorative and has a single status live region", () => {
    const { container } = render(track(view(1)));
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("focusable", "false");
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(container.querySelector("#journey-live")).toHaveTextContent("");
  });

  it("renders a separate alert only when asked", () => {
    const { container, rerender } = render(track(view(1)));
    expect(container.querySelector('[role="alert"]')).toBeNull();
    rerender(track(view(1), { alertText: "Action needed: your vetting check needs attention. Open Vetting for details." }));
    expect(screen.getByRole("alert")).toHaveTextContent("Action needed");
  });

  it("has a compact variant without the svg", () => {
    const { container } = render(track(view(2), { variant: "compact", overdueCount: 2 }));
    expect(container.querySelector("svg")).toBeNull();
    expect(screen.getByText(/2 overdue/)).toBeInTheDocument();
  });
});

describe("HorseTrack updates without a reload", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("changes the progressbar value and announces once, debounced, after progress increases", () => {
    const before = view(0);
    const { rerender, container } = render(track(before));
    const live = container.querySelector("#journey-live")!;
    expect(live).toHaveTextContent("");

    // same page, task completed: only props change
    const after = deriveView(
      {
        tasks: [
          task({ key: "s1-0", title: "Step 0", stage: "CONDITIONAL_OFFER", status: "DONE", id: "x" }),
          task({ key: "s1-1", title: "Step 1", stage: "CONDITIONAL_OFFER", status: "TODO" }),
        ],
        currentStage: "CONDITIONAL_OFFER",
        status: "active",
      },
      new Date("2026-11-20T00:00:00Z"),
    );
    rerender(track({ ...after, progress: 0.1, percent: 10 }, { lastCompletedTitle: "Step 0" }));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "10");
    expect(live).toHaveTextContent(""); // not yet: debounce
    act(() => void vi.advanceTimersByTime(450));
    expect(live.textContent).toMatch(/^Step 0 marked done\. Journey 10 percent complete\. 1 task to go\. Next: Step 1, due /);
  });
});

describe("content variables", () => {
  it("substitutes {{anchorDays}} from the Workday value", () => {
    render(<Markdown source="- **Anchor days:** {{anchorDays}}" vars={{ anchorDays: "Tuesday and Thursday" }} />);
    expect(screen.getByText("Tuesday and Thursday")).toBeInTheDocument();
    expect(screen.queryByText(/\{\{/)).toBeNull();
  });
  it("does not inject raw html", () => {
    const { container } = render(<Markdown source={'<img src=x onerror="alert(1)"> [bad](javascript:alert(1))'} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toContain("<img src=x");
  });
});
