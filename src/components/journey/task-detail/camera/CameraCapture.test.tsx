// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PhotoFlow } from "../PhotoFlow";
import { CameraCapture } from "./CameraCapture";
import { task } from "../../test-data";

vi.mock("next/link", () => ({ default: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));
const apiFetch = vi.fn();
vi.mock("@/lib/auth/client", () => ({ useSession: () => ({ apiFetch }) }));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));

function fakeStream() {
  const track = { stop: vi.fn() };
  return { track, stream: { getTracks: () => [track] } as unknown as MediaStream };
}

function setMedia(getUserMedia: unknown) {
  Object.defineProperty(navigator, "mediaDevices", { value: getUserMedia ? { getUserMedia } : undefined, configurable: true });
}

beforeEach(() => {
  Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() })) as never;
  HTMLCanvasElement.prototype.toBlob = vi.fn((cb: BlobCallback) => cb(new Blob(["x"], { type: "image/jpeg" }))) as never;
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));

describe("CameraCapture", () => {
  it("explains a blocked camera and offers upload", async () => {
    setMedia(vi.fn().mockRejectedValue(Object.assign(new Error("no"), { name: "NotAllowedError" })));
    render(<CameraCapture onUse={vi.fn()} />);
    click("Start camera");
    expect(await screen.findByText(/Camera access was blocked/)).toBeInTheDocument();
  });

  it("explains an insecure context without asking for the camera", () => {
    Object.defineProperty(window, "isSecureContext", { value: false, configurable: true });
    const gum = vi.fn();
    setMedia(gum);
    render(<CameraCapture onUse={vi.fn()} />);
    click("Start camera");
    expect(screen.getByText(/secure \(HTTPS\)/)).toBeInTheDocument();
    expect(gum).not.toHaveBeenCalled();
  });

  it("reports an unsupported browser", () => {
    setMedia(undefined);
    render(<CameraCapture onUse={vi.fn()} />);
    click("Start camera");
    expect(screen.getByText(/can't open the camera/)).toBeInTheDocument();
  });

  it("captures a camera-*.jpg File and stops the tracks; retake restarts the stream", async () => {
    const first = fakeStream();
    const second = fakeStream();
    const gum = vi.fn().mockResolvedValueOnce(first.stream).mockResolvedValueOnce(second.stream);
    setMedia(gum);
    const onUse = vi.fn();
    render(<CameraCapture onUse={onUse} />);
    click("Start camera");
    await screen.findByRole("button", { name: "Take photo" });
    expect(gum).toHaveBeenCalledWith({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
    expect(screen.getByLabelText("Live camera preview")).toBeInTheDocument();
    click("Take photo");
    await screen.findByRole("button", { name: "Use this photo" });
    expect(first.track.stop).toHaveBeenCalled();

    click("Retake");
    await screen.findByRole("button", { name: "Take photo" });
    expect(gum).toHaveBeenCalledTimes(2);

    click("Take photo");
    await screen.findByRole("button", { name: "Use this photo" });
    click("Use this photo");
    const file = onUse.mock.calls[0]![0] as File;
    expect(file.name).toMatch(/^camera-\d+\.jpg$/);
    expect(file.type).toBe("image/jpeg");
  });

  it("stops the stream on unmount", async () => {
    const s = fakeStream();
    setMedia(vi.fn().mockResolvedValue(s.stream));
    const { unmount } = render(<CameraCapture onUse={vi.fn()} />);
    click("Start camera");
    await screen.findByRole("button", { name: "Take photo" });
    unmount();
    expect(s.track.stop).toHaveBeenCalled();
  });
});

describe("PhotoFlow upload fallback", () => {
  it("still sends an uploaded file to the photo check", async () => {
    setMedia(vi.fn());
    const fetchMock = apiFetch.mockResolvedValue(new Response(JSON.stringify({ pass: false, issues: ["Sunglasses"] }), { status: 200 }));
    const t = task({ key: "photo", stage: "PEV" });
    const detail = { kind: "photo", day0Confirmed: true, day0: null, order: null } as never;
    const { container } = render(<PhotoFlow task={t} detail={detail} onChanged={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Upload a photo instead/ })).toBeInTheDocument();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toHaveAttribute("accept", "image/*");
    fireEvent.change(input, { target: { files: [new File(["x"], "me-sunglasses.jpg", { type: "image/jpeg" })] } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0]![0])).toContain("photo-check");
  });
});
