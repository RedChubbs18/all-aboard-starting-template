"use client";

import { controlClass } from "@/components/ui/Field";
import { useId, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { useSession } from "@/lib/auth/client";
import { WITHDRAW_COMMENT_MAX, WITHDRAW_REASONS, type WithdrawReason } from "./withdraw";

/** D14: quiet confirmation dialog. Reason radios, optional comment, nothing is submitted until confirmed. */
export function WithdrawDialog({ open, onClose, onWithdrawn }: { open: boolean; onClose: () => void; onWithdrawn: () => void }) {
  const { apiFetch } = useSession();
  const [reason, setReason] = useState<WithdrawReason | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hintId = useId();
  const errId = useId();

  async function submit() {
    if (!reason) {
      setError("Please choose a reason.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await apiFetch("/api/starter/withdraw", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason, comment: comment.trim() || undefined }),
      });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { message?: string }).message ?? "Something went wrong. Please try again.");
      onWithdrawn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Thinking of not joining?" variant="dialog">
      <p className="text-muted">
        We&apos;re sorry to hear that. If you withdraw, your journey will close and People &amp; Places will be told. You can talk to your line manager or
        P&amp;P first if you would like to.
      </p>
      <fieldset className="mt-4">
        <legend className="font-semibold">Why are you withdrawing?</legend>
        <div className="mt-2 space-y-1">
          {WITHDRAW_REASONS.map((r) => (
            <label key={r.value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-brand-tint">
              <input type="radio" name="withdraw-reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} className="size-5 accent-[var(--color-brand)]" />
              <span>{r.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-4">
        <label htmlFor="withdraw-comment" className="font-semibold">
          Anything else you would like to add? (optional)
        </label>
        <p id={hintId} className="text-sm text-muted">
          Please don&apos;t include personal details.
        </p>
        <textarea
          id="withdraw-comment"
          value={comment}
          maxLength={WITHDRAW_COMMENT_MAX}
          onChange={(e) => setComment(e.target.value)}
          aria-describedby={`${hintId}${error ? ` ${errId}` : ""}`}
          rows={3}
          className={`${controlClass} mt-1`}
        />
        <p className="tabular text-right text-sm text-muted">
          {comment.length} / {WITHDRAW_COMMENT_MAX}
        </p>
      </div>
      {error && (
        <div id={errId} className="mt-2">
          <Alert tone="danger" live="alert">
            {error}
          </Alert>
        </div>
      )}
      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose}>
          Keep my journey
        </Button>
        <Button variant="danger" loading={busy} onClick={submit}>
          Withdraw from onboarding
        </Button>
      </div>
    </Sheet>
  );
}
