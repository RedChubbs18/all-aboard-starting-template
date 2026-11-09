"use client";

import { useEffect, useRef } from "react";
import { Alert } from "@/components/ui/Alert";

/**
 * Summary shown above a form after a failed submit; focus moves to it so screen readers announce it (WCAG 3.3.1, 4.1.3).
 * Pass `focusKey` (for example a submit-attempt counter) so repeating the same failure re-focuses the summary.
 */
export function ErrorSummary({
  message,
  items,
  title = "Please fix the highlighted fields",
  focusKey,
}: {
  message: string | null;
  /** Individual field problems, listed under the message. */
  items?: string[];
  title?: string;
  focusKey?: unknown;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (message) ref.current?.focus();
  }, [message, focusKey]);
  if (!message) return null;
  const list = (items ?? []).filter((i) => i && i !== message);
  return (
    <div ref={ref} tabIndex={-1} role="alert" className="rounded-md">
      <Alert tone="danger" title={title}>
        {message}
        {list.length > 0 && (
          <ul className="mt-1 list-disc pl-5">
            {list.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        )}
      </Alert>
    </div>
  );
}
