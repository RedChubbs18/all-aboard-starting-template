"use client";

import { useRouter } from "next/navigation";
import { useApi } from "@/lib/auth/use-api";
import { SelectField } from "./ui";
import type { StarterListResponse } from "./types";

/** F15: jump between this LM's starters without going back to the list. Shown only when there are 2 or more. */
export function StarterSwitcher({ currentId }: { currentId: string }) {
  const router = useRouter();
  const { data } = useApi<StarterListResponse>("/api/lm/starters");
  if (!data || data.starters.length + data.past.length < 2) return null;
  return (
    <div className="max-w-sm">
      <SelectField label="Switch starter" value={currentId} onChange={(e) => router.push(`/lm/starters/${e.target.value}`)}>
        <optgroup label="Current starters">
          {data.starters.map((s) => (
            <option key={s.id} value={s.id}>
              {s.starterName}
            </option>
          ))}
        </optgroup>
        {data.past.length > 0 && (
          <optgroup label="Past starters (read-only)">
            {data.past.map((s) => (
              <option key={s.id} value={s.id}>
                {s.starterName} ({s.status})
              </option>
            ))}
          </optgroup>
        )}
      </SelectField>
    </div>
  );
}
