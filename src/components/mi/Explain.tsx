import type { ReactNode } from "react";

/** "How these numbers are calculated" disclosure shown under each MI section. Native <details>: keyboard and screen reader friendly. */
export function Explain({ children }: { children: ReactNode }) {
  return (
    <details className="mt-4 rounded-md border border-line bg-page px-3 py-1 text-sm">
      <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold">How these numbers are calculated</summary>
      <div className="space-y-2 pb-3 text-muted">{children}</div>
    </details>
  );
}
