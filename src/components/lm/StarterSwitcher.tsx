"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/auth/use-api";
import { SelectField } from "./ui";
import type { StarterListResponse } from "./types";

/** F15: jump between this LM's starters without going back to the list. Shown only when there are 2 or more. */
export function StarterSwitcher({ currentId }: { currentId: string }) {
  const router = useRouter();
  const { data } = useApi<StarterListResponse>("/api/lm/starters");
  const [choice, setChoice] = useState<string | null>(null);
  if (!data || data.starters.length + data.past.length < 2) return null;
  return (
    <div className="flex max-w-sm items-end gap-2">
      {/* Choosing an option changes nothing until "Go" is pressed (WCAG 3.2.2). */}
      <div className="min-w-0 flex-1">
      <SelectField label="Switch starter" value={choice ?? currentId} onChange={(e) => setChoice(e.target.value)}>
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
      <Button variant="secondary" onClick={() => choice && choice !== currentId && router.push(`/lm/starters/${choice}`)}>
        Go
      </Button>
    </div>
  );
}
