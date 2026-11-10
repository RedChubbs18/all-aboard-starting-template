// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FaceFrame } from "@/lib/vision/landmarker";
import { CameraCapture } from "./CameraCapture";

const h = vi.hoisted(() => ({
  load: vi.fn(),
  detect: vi.fn(),
  close: vi.fn(),
}));
vi.mock("@/lib/vision/landmarker", () => ({ loadLandmarker: () => h.load() }));
// Pixel sampling needs a real canvas: return synthetic, textured, evenly lit grayscale instead.
vi.mock("@/lib/vision/pixels", () => {
  const n = 16;
  const tex = (lo: number, hi: number) => ({ data: Uint8Array.from({ length: n * n }, (_, i) => (((i % n) + Math.floor(i / n)) % 2 ? hi : lo)), width: n, height: n });
  return { readFacePixels: () => ({ face: tex(80, 180), eyes: { left: tex(50, 150), right: tex(50, 150) } }) };
});

const face = (w = 0.5) => {
  const pts = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
  pts[0] = { x: 0.5 - w / 2, y: 0.5 - w * 0.65 };
  pts[1] = { x: 0.5 + w / 2, y: 0.5 + w * 0.65 };
  return pts;
};
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const goodFrame = (): FaceFrame => ({ faces: [face()], matrix: IDENTITY, blendshapes: { eyeBlinkLeft: 0.02, eyeBlinkRight: 0.02 } });

function setup() {
  const track = { stop: vi.fn() };
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [track] }) },
    configurable: true,
  });
}

beforeEach(() => {
  Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
  Object.defineProperty(HTMLMediaElement.prototype, "readyState", { get: () => 4, configurable: true });
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() })) as never;
  HTMLCanvasElement.prototype.toBlob = vi.fn((cb: BlobCallback) => cb(new Blob(["x"], { type: "image/jpeg" }))) as never;
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
  h.close.mockReset();
  h.detect.mockReset().mockImplementation(goodFrame);
  h.load.mockReset().mockResolvedValue({ detect: h.detect, close: h.close });
  setup();
});
afterEach(cleanup);

const start = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Start camera" }));
  return screen.findByRole("button", { name: "Take photo" });
};
const help = () => document.getElementById("camera-take-help")?.textContent ?? "";

describe("CameraCapture live checks", () => {
  it("disables Take photo with the reason while the checks fail", async () => {
    h.detect.mockImplementation(() => ({ ...goodFrame(), faces: [face(), face()] }));
    render(<CameraCapture onUse={vi.fn()} />);
    const take = await start();
    await waitFor(() => expect(help()).toBe("Make sure only you are in the frame"));
    expect(take).toHaveAttribute("aria-disabled", "true");
    expect(take).toHaveAttribute("aria-describedby", "camera-take-help");
    fireEvent.click(take);
    expect(screen.queryByRole("button", { name: "Use this photo" })).not.toBeInTheDocument();
  });

  it("explains how to fix framing", async () => {
    h.detect.mockImplementation(() => ({ ...goodFrame(), faces: [face(0.2)] }));
    render(<CameraCapture onUse={vi.fn()} />);
    await start();
    await waitFor(() => expect(help()).toBe("Move closer"));
  });

  it("enables Take photo only after every check has held for about 500ms, then captures with a summary", async () => {
    const onUse = vi.fn();
    render(<CameraCapture onUse={onUse} />);
    const take = await start();
    await waitFor(() => expect(help()).toBe("Hold still for a moment..."));
    expect(take).toHaveAttribute("aria-disabled", "true");
    await waitFor(() => expect(take).not.toHaveAttribute("aria-disabled"), { timeout: 3000 });
    expect(screen.getAllByText(/^Met:/).length).toBe(6);
    fireEvent.click(take);
    fireEvent.click(await screen.findByRole("button", { name: "Use this photo" }));
    expect(onUse.mock.calls[0]![1]).toMatchObject({ version: 1, available: true, failed: [] });
  });

  it("blocks again when a check starts failing", async () => {
    render(<CameraCapture onUse={vi.fn()} />);
    const take = await start();
    await waitFor(() => expect(take).not.toHaveAttribute("aria-disabled"), { timeout: 3000 });
    h.detect.mockImplementation(() => ({ ...goodFrame(), matrix: [0.8, 0, -0.6, 0, 0, 1, 0, 0, 0.6, 0, 0.8, 0, 0, 0, 0, 1] }));
    await waitFor(() => expect(take).toHaveAttribute("aria-disabled", "true"));
    expect(help()).toBe("Look straight at the camera");
  });

  it("falls back when the model cannot load: says so and still allows capture", async () => {
    h.load.mockRejectedValue(new Error("WebGL unavailable"));
    const onUse = vi.fn();
    render(<CameraCapture onUse={onUse} />);
    const take = await start();
    expect(await screen.findByText(/Live checks aren't available on this device\. You can still take a photo; it will be checked after you take it/)).toBeInTheDocument();
    await waitFor(() => expect(take).not.toHaveAttribute("aria-disabled"));
    fireEvent.click(take);
    fireEvent.click(await screen.findByRole("button", { name: "Use this photo" }));
    expect(onUse.mock.calls[0]![1]).toMatchObject({ available: false });
  });

  it("falls back if detection throws mid-session", async () => {
    h.detect.mockImplementation(() => {
      throw new Error("gpu lost");
    });
    render(<CameraCapture onUse={vi.fn()} />);
    const take = await start();
    await screen.findByText(/Live checks aren't available/);
    await waitFor(() => expect(take).not.toHaveAttribute("aria-disabled"));
    expect(h.close).toHaveBeenCalled();
  });

  it("states the privacy note and releases the landmarker on unmount", async () => {
    const { unmount } = render(<CameraCapture onUse={vi.fn()} />);
    await start();
    expect(screen.getByText(/Camera frames never leave it, and nothing is stored/)).toBeInTheDocument();
    await waitFor(() => expect(h.detect).toHaveBeenCalled());
    unmount();
    expect(h.close).toHaveBeenCalled();
  });
});
