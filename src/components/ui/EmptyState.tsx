/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from "react";

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-md border border-line bg-card px-4 py-10 text-center">
      <img src="/brand/horse-rest.svg" alt="" aria-hidden width={96} height={64} className="mx-auto h-16 w-24 opacity-60" />
      <h2 className="mt-3 text-xl font-bold">{title}</h2>
      {children && <p className="mx-auto mt-1 max-w-sm text-muted">{children}</p>}
      {action && <div className="mt-4 flex justify-center gap-3">{action}</div>}
    </div>
  );
}
