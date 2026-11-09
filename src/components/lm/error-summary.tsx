"use client";

import { useEffect, useRef } from "react";
import { Alert } from "@/components/ui/Alert";

/** Summary shown above a form after a failed submit; focus moves to it so screen readers announce it. */
export function ErrorSummary({ message }: { message: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (message) ref.current?.focus();
  }, [message]);
  if (!message) return null;
  return (
    <div ref={ref} tabIndex={-1} role="alert" className="rounded-md">
      <Alert tone="danger" title="Please fix the highlighted fields">
        {message}
      </Alert>
    </div>
  );
}
