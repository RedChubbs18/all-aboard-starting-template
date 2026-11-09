"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useApi } from "@/lib/auth/use-api";

function Value() {
  const journeyId = useSearchParams().get("journeyId");
  const { data, error, loading } = useApi<{ text: string }>(`/api/starter/anchor-days${journeyId ? `?journeyId=${encodeURIComponent(journeyId)}` : ""}`);
  if (loading) return <span className="text-text-muted">checking Workday...</span>;
  if (error || !data) return <span className="text-text-muted">shown in Workday (we couldn&apos;t load them just now)</span>;
  return <strong>{data.text}</strong>;
}

/**
 * FR-1.5: fills `{{anchorDays}}` on server-rendered content pages from WorkdayAdapter. The page HTML stays
 * cacheable for offline use; only this value is fetched (with credentials) in the browser.
 */
export function AnchorDaysValue() {
  return (
    <Suspense fallback={<span className="text-text-muted">checking Workday...</span>}>
      <Value />
    </Suspense>
  );
}
