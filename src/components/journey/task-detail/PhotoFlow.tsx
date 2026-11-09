"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { Camera, Check, ImageUp, XCircle } from "lucide-react";
import { useEffect, useReducer, useRef, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime } from "../format";
import { canSubmitPhoto, initialPhotoState, photoReducer, validatePhotoFile } from "../photo-machine";
import type { Detail } from "../detail-types";
import type { TaskDto } from "../types";
import { usePost } from "./use-post";

type PhotoDetail = Extract<Detail, { kind: "photo" }>;

const TIPS = ["Face the camera", "No sunglasses or hat", "Plain background", "Good light"];

/** FR-3.11 / FR-3.12. The image stays in this component's memory (and the one request); only a reference leaves. */
export function PhotoFlow({ task, detail, onChanged }: { task: TaskDto; detail: PhotoDetail; onChanged: () => void | Promise<void> }) {
  const [state, dispatch] = useReducer(photoReducer, initialPhotoState);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<File | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const { post, busy } = usePost();
  const toast = useToast();

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const ordered = detail.order;
  const done = task.status === "DONE" || state.step === "submitted";

  if (ordered || state.step === "submitted") {
    const o = ordered;
    return (
      <Alert tone="success" title="Pass ordered" live="status">
        <p>
          Your photo ID pass has been ordered to{" "}
          <strong>{o?.location ?? (state.step === "submitted" ? state.location : detail.day0?.where)}</strong>. Reference {o?.ref ?? (state.step === "submitted" ? state.orderRef : "")}.
        </p>
        <p className="mt-1">We don&apos;t keep your photo in this app.</p>
      </Alert>
    );
  }
  if (!task.canAct) {
    return <p className="text-muted">Only the starter can upload their photo. Status: {task.status === "DONE" ? "photo accepted" : "waiting for the starter"}.</p>;
  }
  if (task.status === "LOCKED") return null;

  async function choose(file: File | undefined) {
    if (!file) return;
    const invalid = validatePhotoFile(file);
    if (invalid) {
      dispatch({ type: "INVALID_FILE", message: invalid });
      return;
    }
    fileRef.current = file;
    setPreview((p) => {
      if (p) URL.revokeObjectURL(p);
      return URL.createObjectURL(file);
    });
    dispatch({ type: "SELECT", fileName: file.name });
    const form = new FormData();
    form.set("taskId", task.id);
    form.set("photo", file, file.name); // file name is passed through: the mock decides by name
    const r = await post<{ pass: boolean; issues: string[]; photoRef?: string; token?: string; pendingReview?: boolean }>("/api/starter/photo-check", form);
    if (!r.ok || !r.data) {
      dispatch({ type: "CHECK_FAILED", message: r.error ?? "We couldn't check your photo. Try again or ask P&P." });
    } else if (r.data.pass && r.data.photoRef && r.data.token) {
      dispatch({ type: "PASSED", photoRef: r.data.photoRef, token: r.data.token });
    } else {
      dispatch({ type: "REJECTED", issues: r.data.issues?.length ? r.data.issues : ["We couldn't use that photo."] });
      if (r.data.pendingReview) dispatch({ type: "REVIEW_REQUESTED" }); // server already queued an LM / P&P review
    }
  }

  function retake() {
    fileRef.current = null;
    setPreview((p) => {
      if (p) URL.revokeObjectURL(p);
      return null;
    });
    dispatch({ type: "RETRY" });
  }

  async function askReview() {
    const r = await post("/api/starter/photo-review", { taskId: task.id });
    if (r.ok) {
      dispatch({ type: "REVIEW_REQUESTED" });
      toast.success("We've asked your line manager and P&P to review your photo");
      void onChanged();
    } else toast.error(r.error ?? "Couldn't send that request");
  }

  async function submit() {
    if (state.step !== "passed") return;
    const { photoRef, token } = state;
    dispatch({ type: "SUBMIT" });
    const r = await post<{ order: { ref: string; location: string } }>("/api/starter/photo-submit", { taskId: task.id, photoRef, token });
    if (r.ok && r.data) {
      dispatch({ type: "SUBMITTED", orderRef: r.data.order.ref, location: r.data.order.location });
      toast.success("Pass ordered");
      void onChanged();
    } else {
      dispatch({ type: "SUBMIT_FAILED", message: r.error ?? "" });
      toast.error(r.error ?? "Couldn't order your pass");
    }
  }

  const checking = state.step === "checking";
  const canSubmit = canSubmitPhoto(state) && detail.day0Confirmed && !!detail.day0;
  const submitting = state.step === "submitting";
  const pickDisabled = checking || submitting;
  const reason = !canSubmitPhoto(state) && state.step !== "submitting" ? "Submit unlocks when the photo passes." : !detail.day0Confirmed ? "Confirm your Day 0 arrangements first, so we know where to send your pass." : null;

  return (
    <div className="space-y-4">
      {done && <Alert tone="success">Your photo has been accepted.</Alert>}

      <div className="space-y-4">
        <div>
          <div className="relative flex h-[min(46vh,380px)] w-full items-center justify-center overflow-hidden rounded-md bg-viewfinder">
            {preview ? (
              <img src={preview} alt="Preview of the photo you chose" className="h-full w-full object-cover" />
            ) : (
              <span className="px-4 text-center text-sm text-card">Your photo will appear here</span>
            )}
            {/* Dashed oval guide, centred over the preview. */}
            <span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[70%] w-[48%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-2 border-dashed border-focus" />
            {state.step === "passed" && (
              <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-brand-tint px-2.5 py-0.5 text-xs font-bold text-brand-strong">
                <Check aria-hidden className="size-4" /> Passed
              </span>
            )}
            {state.step === "rejected" && (
              <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-blocked-tint px-2.5 py-0.5 text-xs font-bold text-blocked">
                <XCircle aria-hidden className="size-4" /> Not accepted
              </span>
            )}
          </div>
          <section aria-labelledby="photo-tips" className="mt-3 rounded-md border border-line bg-card">
            <h3 id="photo-tips" className="px-4 pt-3 font-bold">
              Before you start
            </h3>
            <ul className="mt-1">
              {TIPS.map((t) => (
                <li key={t} className="flex items-start gap-3 border-t border-line px-4 py-2.5 first:border-t-0">
                  <span
                    aria-hidden
                    className={`mt-1 size-4 shrink-0 rounded-full ${state.step === "passed" || state.step === "submitting" || done ? "bg-brand" : "border-2 border-disabled"}`}
                  />
                  {t}
                </li>
              ))}
            </ul>
          </section>
          <div className="mt-3 flex gap-2">
            <input ref={cameraInput} type="file" accept="image/*" capture="user" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ""; }} />
            <input ref={fileInput} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ""; }} />
            <Button variant={state.step === "rejected" ? "primary" : "secondary"} className="flex-1" disabled={pickDisabled} onClick={() => cameraInput.current?.click()}>
              <Camera aria-hidden className="size-5" />
              {state.step === "rejected" || state.step === "passed" ? "Retake photo" : "Take photo"}
            </Button>
            <Button variant="secondary" className="flex-1" disabled={pickDisabled} onClick={() => fileInput.current?.click()}>
              <ImageUp aria-hidden className="size-5" />
              Choose file
            </Button>
          </div>
          {state.step === "idle" && state.notice && (
            <p role="alert" className="mt-2 flex items-start gap-1 text-blocked">
              <XCircle aria-hidden className="mt-0.5 size-5 shrink-0" />
              {state.notice}
            </p>
          )}
        </div>

        <div className="space-y-3">
          {checking && (
            <p role="status" className="flex items-center gap-2">
              <span aria-hidden className="size-5 rounded-full border-2 border-brand border-t-transparent motion-safe:animate-spin" />
              Checking your photo...
            </p>
          )}

          {state.step === "rejected" && (
            <Alert tone="danger" live="alert" title="We can't use this photo yet">
              <ul className="list-none space-y-1">
                {state.issues.map((i) => (
                  <li key={i} className="flex items-start gap-1">
                    <XCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
                    {i}
                  </li>
                ))}
              </ul>
              <p className="mt-2">If you think this is wrong, your line manager or P&amp;P can review it.</p>
              {state.reviewRequested ? (
                <p className="mt-2 font-semibold">Review requested. We&apos;ll let you know.</p>
              ) : (
                <Button variant="ghost" className="mt-1 underline" onClick={askReview}>
                  Ask P&amp;P to review
                </Button>
              )}
            </Alert>
          )}

          {state.step === "error" && (
            <Alert tone="danger" live="alert" title="We couldn't check your photo">
              <p>{state.message}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={retake}>
                  Try again
                </Button>
                <Button variant="ghost" className="underline" onClick={askReview}>
                  Ask P&amp;P to review
                </Button>
              </div>
            </Alert>
          )}

          {state.step === "passed" || state.step === "submitting" ? (
            <Alert tone="success" live="status" title="Photo looks good">
              <p>
                Your pass will be sent to <strong>{detail.day0?.where ?? "your Day 0 location"}</strong>
                {detail.day0 ? `, for ${formatDateTime(detail.day0.whenAt)}` : ""}.
              </p>
            </Alert>
          ) : null}

          {detail.reviewRequested && state.step !== "passed" && state.step !== "submitting" && (
            <Alert tone="info" title="A review has been requested">
              <p>Your line manager or P&amp;P will look at your photo. You can also try another photo.</p>
            </Alert>
          )}

          <Button
            size="lg"
            className="w-full"
            loading={submitting}
            aria-disabled={!canSubmit}
            aria-describedby="photo-submit-help"
            onClick={() => canSubmit && void submit()}
          >
            Submit photo
          </Button>
          <p id="photo-submit-help" className="text-sm text-muted">
            {reason ?? "Your photo is used only for your pass and isn't kept in this app."}
            {!detail.day0Confirmed && detail.confirmTaskId && (
              <>
                {" "}
                <Link href={`/journey/task/${detail.confirmTaskId}`} className="text-brand-strong underline underline-offset-2">
                  Go to Day 0 arrangements
                </Link>
              </>
            )}
          </p>
          {busy && !checking && !submitting && <span className="sr-only">Working</span>}
        </div>
      </div>
    </div>
  );
}
