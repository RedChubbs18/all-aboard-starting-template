// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TaskDetailResponse } from "../detail-types";
import { VideoView } from "./ActionViews";

vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));

const make = (url: string | null, status = "TODO"): TaskDetailResponse =>
  ({
    task: { key: "watch-executive-welcome", title: "Watch", status, canAct: true },
    content: { slug: "s", title: "Welcome", type: "VIDEO", body: "## Welcome\n\nA message.\n\n**Video URL:** `https://youtu.be/4XfbVKkJHbI`\n" },
    detail: { kind: "video", url },
  }) as unknown as TaskDetailResponse;

type W = Window & { YT?: unknown };
const YT_URL = "https://youtu.be/4XfbVKkJHbI";

afterEach(() => {
  cleanup();
  delete (window as W).YT;
  document.head.querySelectorAll("script").forEach((s) => s.remove());
});

describe("VideoView with YouTube", () => {
  it("renders the privacy-enhanced iframe, lazily loads the API, and completes on ENDED", async () => {
    let handlers: { onStateChange?: (e: { data: number }) => void } = {};
    (window as W).YT = {
      Player: class {
        constructor(_el: unknown, o: { events: typeof handlers }) {
          handlers = o.events;
        }
        destroy() {}
      },
    };
    const onComplete = vi.fn().mockResolvedValue(undefined);
    render(<VideoView data={make(YT_URL)} onChanged={vi.fn()} onComplete={onComplete} completing={false} />);
    const frame = screen.getByTitle("Group Executive welcome video") as HTMLIFrameElement;
    expect(frame.src).toContain("https://www.youtube-nocookie.com/embed/4XfbVKkJHbI");
    expect(frame.src).toContain("enablejsapi=1");
    expect(screen.getByText("This video is hosted on YouTube (privacy-enhanced mode).")).toBeInTheDocument();
    await waitFor(() => expect(handlers.onStateChange).toBeDefined());
    act(() => handlers.onStateChange?.({ data: 1 }));
    expect(onComplete).not.toHaveBeenCalled();
    act(() => handlers.onStateChange?.({ data: 0 }));
    act(() => handlers.onStateChange?.({ data: 0 }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("falls back to a YouTube link when the API script fails to load", async () => {
    render(<VideoView data={make(YT_URL)} onChanged={vi.fn()} onComplete={vi.fn()} completing={false} />);
    const script = document.head.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    expect(script).not.toBeNull();
    act(() => {
      fireEvent.error(script!);
    });
    const link = await screen.findByRole("link", { name: "Watch on YouTube (opens in a new tab)" });
    expect(link).toHaveAttribute("href", "https://www.youtube.com/watch?v=4XfbVKkJHbI");
    expect(link).toHaveAttribute("target", "_blank");
    expect(screen.queryByTitle("Group Executive welcome video")).toBeNull();
    expect(screen.getByRole("button", { name: /I've watched it/ })).toBeInTheDocument();
  });

  it("keeps the I've watched it button working", async () => {
    (window as W).YT = { Player: class { destroy() {} } };
    const onComplete = vi.fn().mockResolvedValue(undefined);
    render(<VideoView data={make(YT_URL)} onChanged={vi.fn()} onComplete={onComplete} completing={false} />);
    fireEvent.click(screen.getByRole("button", { name: /I've watched it/ }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
