"use client";

/* eslint-disable @next/next/no-img-element */
import { Camera, Check, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { summarise, type LocalCheckSummary } from "@/lib/vision/checks";
import { LiveChecklist } from "./LiveChecklist";
import { useLiveChecks } from "./use-live-checks";

export type CameraPhase = "intro" | "starting" | "live" | "captured" | "paused" | "denied" | "nocamera" | "insecure" | "unsupported" | "error";

const FALLBACK: Partial<Record<CameraPhase, string>> = {
  denied: "Camera access was blocked. You can allow it in your browser settings, or upload a photo instead.",
  nocamera: "We couldn't find a camera on this device. You can upload a photo instead.",
  insecure: "The camera only works on a secure (HTTPS) connection, or on localhost. You can upload a photo instead.",
  unsupported: "This browser can't open the camera from a web page. You can upload a photo instead.",
  error: "We couldn't start the camera. It may be in use by another app. Try again, or upload a photo instead.",
};

const ANNOUNCE: Partial<Record<CameraPhase, string>> = {
  starting: "Starting the camera",
  live: "Camera is on. Line your face up with the oval, then take your photo.",
  captured: "Photo taken. Use this photo, or retake it.",
  paused: "Camera paused because the page was hidden.",
};

function classify(err: unknown): CameraPhase {
  const name = typeof err === "object" && err !== null && "name" in err ? String((err as { name: unknown }).name) : "";
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return "denied";
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") return "nocamera";
  return "error";
}

interface Props {
  /** The captured JPEG, once the user chooses "Use this photo", with a small summary of the on-device checks. */
  onUse: (file: File, localChecks?: LocalCheckSummary) => void;
  /** Reports whether a photo has been taken (for the conditions list). */
  onCapturedChange?: (captured: boolean) => void;
  disabled?: boolean;
  /** Focus the start button on mount (used after "Retake photo" removed the previous focus target). */
  focusOnMount?: boolean;
}

/** Live camera viewfinder (STYLE section 15). The preview is mirrored; the exported JPEG is not. */
export function CameraCapture({ onUse, onCapturedChange, disabled, focusOnMount }: Props) {
  const [phase, setPhase] = useState<CameraPhase>("intro");
  const [shot, setShot] = useState<{ file: File; url: string; summary: LocalCheckSummary } | null>(null);
  const [auto, setAuto] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startId = useRef(0);
  const wantFocus = useRef(!!focusOnMount);
  const live = useLiveChecks(videoRef, phase === "live");
  // Capture is allowed once every on-device check has held for 500ms, or when live checks can't run on this
  // device (the server check still gates the pass).
  const canTake = live.status === "unavailable" || (live.status === "running" && live.ready);
  const takeHelp = live.status === "loading" ? "Starting live checks..." : (live.reason ?? "Hold still for a moment...");

  const stop = useCallback(() => {
    startId.current++; // invalidates any in-flight getUserMedia
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const start = useCallback(async () => {
    stop();
    const id = startId.current;
    if (typeof window !== "undefined" && window.isSecureContext === false) return setPhase("insecure");
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return setPhase("unsupported");
    setPhase("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      if (id !== startId.current) {
        stream.getTracks().forEach((t) => t.stop()); // unmounted or superseded while the prompt was open
        return;
      }
      streamRef.current = stream;
      wantFocus.current = true;
      setPhase("live");
    } catch (e) {
      if (id === startId.current) setPhase(classify(e));
    }
  }, [stop]);

  // Attach the stream once the <video> is shown.
  useEffect(() => {
    if (phase === "live" && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      void videoRef.current.play?.()?.catch(() => undefined);
    }
  }, [phase]);

  // Move focus to the primary action of the new step (only after a user-driven step change).
  useEffect(() => {
    if (!wantFocus.current) return;
    wantFocus.current = false;
    rootRef.current?.querySelector<HTMLElement>("[data-step-focus]")?.focus();
  }, [phase]);

  // Release the camera on unmount and when the page is hidden.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden" && streamRef.current) {
        stop();
        setPhase("paused");
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      stop();
    };
  }, [stop]);

  useEffect(() => () => void (shot && URL.revokeObjectURL(shot.url)), [shot]);
  useEffect(() => onCapturedChange?.(phase === "captured"), [phase, onCapturedChange]);

  async function take() {
    const video = videoRef.current;
    if (!video || !canTake) return;
    const summary = summarise(live.results, live.status === "running");
    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 960;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return setPhase("error");
    ctx.drawImage(video, 0, 0, w, h); // drawn as-is: the saved photo is not mirrored
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.9));
    if (!blob) return setPhase("error");
    stop();
    const file = new File([blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" });
    wantFocus.current = true;
    setShot({ file, url: URL.createObjectURL(file), summary });
    setPhase("captured");
  }

  // Optional auto-capture: a 3-2-1 countdown that starts when every check passes and cancels if one fails.
  const armed = auto && phase === "live" && live.status === "running" && live.ready;
  const countdown = armed ? (remaining ?? 3) : null;
  const takeRef = useRef(take);
  useEffect(() => {
    takeRef.current = take;
  });
  useEffect(() => {
    if (!armed) return;
    let n = 3;
    const id = setInterval(() => {
      n -= 1;
      if (n <= 0) {
        clearInterval(id);
        void takeRef.current();
      } else setRemaining(n);
    }, 1000);
    return () => {
      clearInterval(id);
      setRemaining(null);
    };
  }, [armed]);

  function retake() {
    setShot(null);
    wantFocus.current = true; // Retake unmounts; the start button (shown while starting) takes focus (WCAG 2.4.3)
    void start();
  }

  const fallback = FALLBACK[phase];
  const showStage = phase === "starting" || phase === "live" || phase === "captured";
  // The start button stays mounted while "starting" so keyboard focus is not dropped.
  const canRestart = phase === "starting" || phase === "intro" || phase === "paused" || phase === "denied" || phase === "nocamera" || phase === "error";

  return (
    <div ref={rootRef}>
      <p role="status" className="sr-only">
        {ANNOUNCE[phase] ?? ""}
      </p>
      <div className="relative flex h-[min(46vh,380px)] w-full items-center justify-center overflow-hidden rounded-md bg-viewfinder">
        {phase === "captured" && shot ? (
          <img src={shot.url} alt="The photo you just took" className="h-full w-full -scale-x-100 object-cover" />
        ) : (
          <video
            ref={videoRef}
            aria-label="Live camera preview"
            playsInline
            muted
            autoPlay
            className={`h-full w-full -scale-x-100 object-cover ${phase === "live" ? "" : "hidden"}`}
          />
        )}
        {phase === "starting" && <span className="absolute px-4 text-center text-sm text-card">Waiting for camera permission...</span>}
        {!showStage && (
          <div className="px-6 text-center text-sm text-card">
            {phase === "intro" && "Your browser will ask to use your camera. We only use it to take this one photo."}
            {phase === "paused" && "The camera was switched off while this page was hidden."}
            {fallback && "Camera unavailable"}
          </div>
        )}
        {showStage && (
          <span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[70%] w-[48%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-2 border-dashed border-focus" />
        )}
      </div>

      {phase === "live" && <LiveChecklist live={live} countdown={countdown} />}
      {phase === "live" && live.status === "running" && (
        <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="size-6 accent-[var(--color-brand)]" />
          Take the photo for me when all checks pass
        </label>
      )}
      {countdown !== null && (
        <p aria-hidden className="mt-1 text-sm font-semibold">
          Taking your photo in {countdown}...
        </p>
      )}

      {fallback && (
        <Alert tone="warning" live="alert" className="mt-3">
          <p>{fallback}</p>
        </Alert>
      )}

      <div className="mt-3 flex gap-2">
        {canRestart && (
          <Button
            data-step-focus
            variant="primary"
            className="flex-1"
            aria-disabled={disabled || undefined}
            loading={phase === "starting"}
            onClick={() => void start()}
          >
            {phase !== "starting" && <Camera aria-hidden className="size-5" />}
            {phase === "starting" ? "Starting camera..." : phase === "intro" ? "Start camera" : "Try camera again"}
          </Button>
        )}
        {phase === "live" && (
          <Button
            data-step-focus
            variant="primary"
            className="flex-1"
            aria-disabled={disabled || !canTake || undefined}
            aria-describedby="camera-take-help"
            onClick={() => void take()}
          >
            <Camera aria-hidden className="size-5" />
            Take photo
          </Button>
        )}
        {phase === "captured" && shot && (
          <>
            <Button variant="secondary" className="flex-1" aria-disabled={disabled || undefined} onClick={retake}>
              <RotateCcw aria-hidden className="size-5" />
              Retake
            </Button>
            <Button data-step-focus variant="primary" className="flex-1" aria-disabled={disabled || undefined} onClick={() => onUse(shot.file, shot.summary)}>
              <Check aria-hidden className="size-5" />
              Use this photo
            </Button>
          </>
        )}
      </div>
      {phase === "live" && (
        <p id="camera-take-help" className="mt-2 text-sm text-muted">
          {canTake ? (live.status === "unavailable" ? "Take your photo when you're ready." : "All checks passed. Take your photo.") : takeHelp}
        </p>
      )}
      {(phase === "live" || phase === "starting") && (
        <p className="mt-2 text-sm text-muted">These checks run on your device. Camera frames never leave it, and nothing is stored. Only the photo you choose to use is sent for checking.</p>
      )}
    </div>
  );
}
