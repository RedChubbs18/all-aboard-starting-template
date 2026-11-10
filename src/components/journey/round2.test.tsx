// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { deriveView } from "./derive";
import { vettingTiming } from "./format";
import { JourneyView } from "./JourneyView";
import { StageAccordion } from "./StageAccordion";
import { TaskCard } from "./TaskCard";
import { needsCompletionPrompt } from "./task-rules";
import { task } from "./test-data";
import type { JourneyResponse } from "./types";

vi.mock("@/lib/auth/client", () => ({ useSession: () => ({ apiFetch: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ children, href, ref, ...rest }: { children: React.ReactNode; href: string; ref?: React.Ref<HTMLAnchorElement> }) => (
    <a href={href} ref={ref} {...rest}>
      {children}
    </a>
  ),
}));

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

const card = (over: Parameters<typeof task>[0], onComplete = vi.fn()) => {
  const t = task(over);
  render(
    <ul>
      <TaskCard task={t} onComplete={onComplete} />
    </ul>,
  );
  return { t, onComplete };
};

describe("D30 completion prompt on a card", () => {
  it("asks 'Is this task complete?' with the task title for an action task, and completes only on yes", async () => {
    const { t, onComplete } = card({ key: "a", stage: "DAY_0", title: "Say hello on Teams", type: "ACTION" });
    fireEvent.click(screen.getByRole("button", { name: "Mark done: Say hello on Teams" }));
    expect(onComplete).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "Is this task complete?" });
    expect(dialog).toHaveTextContent("Say hello on Teams");
    expect(screen.getByRole("button", { name: "Not yet, I'll come back to it" })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Yes, mark as done" }));
    });
    expect(onComplete).toHaveBeenCalledWith(t);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("'Not yet' closes the dialog and changes nothing", async () => {
    const { onComplete } = card({ key: "a", stage: "DAY_0", title: "Choose your flex benefits", type: "ACTION" });
    fireEvent.click(screen.getByRole("button", { name: /Mark done/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Not yet, I'll come back to it" }));
    });
    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Is this task complete?" })).not.toBeInTheDocument();
  });

  it("does not prompt for a reading task", () => {
    const { onComplete } = card({ key: "r", stage: "DAY_0", title: "Read the guide", type: "INFO" });
    fireEvent.click(screen.getByRole("button", { name: /Mark done/ }));
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("needsCompletionPrompt follows type, auto-complete and flow rules", () => {
    expect(needsCompletionPrompt({ type: "ACTION", key: "x" })).toBe(true);
    expect(needsCompletionPrompt({ type: "CHECKLIST", key: "x" })).toBe(true);
    expect(needsCompletionPrompt({ type: "TRAINING", key: "x" })).toBe(true);
    expect(needsCompletionPrompt({ type: "INFO", key: "x" })).toBe(false);
    expect(needsCompletionPrompt({ type: "VIDEO", key: "x" })).toBe(false);
    expect(needsCompletionPrompt({ type: "ACTION", key: "x", autoCompleteOnOpen: true })).toBe(false);
    expect(needsCompletionPrompt({ type: "BOOKING", key: "book-induction" })).toBe(false);
    expect(needsCompletionPrompt({ type: "ORDER", key: "device-choice-submitted" })).toBe(false);
    expect(needsCompletionPrompt({ type: "ACTION", key: "upload-pass-photo" })).toBe(false);
    expect(needsCompletionPrompt({ type: "ACTION", key: "confirm-day-0-arrangements" })).toBe(false);
  });
});

describe("D31 unlock hints", () => {
  const now = new Date("2026-12-01T00:00:00Z");
  const tasks = [
    task({ key: "u", stage: "UNCONDITIONAL_OFFER", status: "DONE", gating: true }),
    task({ key: "d0", stage: "DAY_0", status: "LOCKED" }),
    task({ key: "d30", stage: "DAY_30", status: "LOCKED" }),
  ];
  const hint = (key: string, over: Partial<Parameters<typeof deriveView>[0]> = {}) =>
    deriveView({ tasks, currentStage: "UNCONDITIONAL_OFFER", status: "active", startDate: "2027-01-11T00:00:00.000Z", ...over }, now).stages.find((s) => s.key === key)!.unlockHint;

  it("says 'Unlocks on <date>' for Day 0 when the earlier tasks are done", () => {
    const zero = { done: 0, total: 0, gatingDone: 0, gatingTotal: 0 };
    const overall = { CONDITIONAL_OFFER: zero, PEV: zero, UNCONDITIONAL_OFFER: { done: 1, total: 1, gatingDone: 1, gatingTotal: 1 }, DAY_0: zero, DAY_30: zero };
    expect(hint("DAY_0", { overall })).toBe("Unlocks on Monday 11 January.");
  });
  it("adds the date to the task hint when tasks are still open, and for Day 30 (start + 30 days)", () => {
    expect(hint("DAY_0")).toBe("Unlocks when Unconditional offer tasks are done, and not before Monday 11 January.");
    expect(hint("DAY_30")).toBe("Unlocks when Day 0 tasks are done, and not before Wednesday 10 February.");
  });
  it("falls back to the task hint once the date has passed", () => {
    expect(hint("DAY_0", { startDate: "2026-11-01T00:00:00.000Z" })).toBe("Unlocks when Unconditional offer tasks are done.");
  });
});

describe("D32 vetting timing", () => {
  const now = new Date("2026-11-10T09:00:00Z");
  it("says 'Due soon' within a week (or past) and 'Due <date>' otherwise", () => {
    expect(vettingTiming("2026-11-12T00:00:00.000Z", now)).toBe("Due soon");
    expect(vettingTiming("2026-11-01T00:00:00.000Z", now)).toBe("Due soon");
    expect(vettingTiming("2026-11-24T00:00:00.000Z", now)).toBe("Due Tue 24 Nov");
  });

  const pev = (fa: "not_started" | "in_progress" | null) => {
    const fa1 = task({ key: "firstadvantage-vetting-status", stage: "PEV", status: "TODO", owner: "SYSTEM", type: "INTEGRATION_STATUS", adapterKey: "firstadvantage", dueDate: "2026-11-12T00:00:00.000Z" });
    const journey = {
      tasks: [fa1],
      firstadvantage: fa ? { status: fa, updatedAt: "2026-11-09T00:00:00.000Z", actionUrl: "https://firstadvantage.example.test/candidate" } : null,
      pnp: null,
      viewerIsStarter: true,
    };
    const stages = deriveView({ tasks: [fa1], currentStage: "PEV", status: "active" }, now).stages;
    return render(<StageAccordion stages={stages} journey={journey} now={now} />);
  };

  it("shows only timing, no status label, before the colleague is invited", () => {
    for (const fa of [null, "not_started"] as const) {
      const { unmount } = pev(fa);
      expect(screen.getByText("Due soon")).toBeInTheDocument();
      expect(screen.queryByText("Not started")).not.toBeInTheDocument();
      expect(screen.queryByText("First Advantage status")).not.toBeInTheDocument();
      unmount();
    }
  });
  it("shows the status once invited", () => {
    pev("in_progress");
    expect(screen.getByText("First Advantage status")).toBeInTheDocument();
    expect(screen.getByText("In progress")).toBeInTheDocument();
  });
});

describe("D26 guest hint", () => {
  const data = (stage: "CONDITIONAL_OFFER" | "PEV" | "UNCONDITIONAL_OFFER", viewerIsStarter = true) =>
    ({
      journey: {
        id: "j", status: "active", currentStage: stage, startDate: "2027-01-11T00:00:00.000Z", flagged: false, flagReason: null,
        starter: { id: "s", name: "Jo Bloggs", upn: "jo@example.test", photoUrl: null, jobTitle: null, teamRole: null, bio: null },
        lm: { id: "l", name: "Dana", upn: "d@example.test", photoUrl: null, jobTitle: null, teamRole: null, bio: null },
        buddy: null, pnp: null, viewerRelation: viewerIsStarter ? "STARTER" : "LM", viewerIsStarter, tasks: [], firstadvantage: null,
      },
      others: [],
    }) as unknown as JourneyResponse;

  it("shows between offer accepted and the unconditional offer, for the starter only", () => {
    const { rerender } = render(<JourneyView data={data("CONDITIONAL_OFFER")} />);
    expect(screen.getByText(/signed in with your personal account as a guest/)).toBeInTheDocument();
    rerender(<JourneyView data={data("PEV")} />);
    expect(screen.getByText(/signed in with your personal account as a guest/)).toBeInTheDocument();
    rerender(<JourneyView data={data("UNCONDITIONAL_OFFER")} />);
    expect(screen.queryByText(/signed in with your personal account as a guest/)).not.toBeInTheDocument();
    rerender(<JourneyView data={data("CONDITIONAL_OFFER", false)} />);
    expect(screen.queryByText(/signed in with your personal account as a guest/)).not.toBeInTheDocument();
  });
});
