"use client";

import { useParams } from "next/navigation";
import { RoleGate } from "@/components/shell/RoleGate";
import { StarterDetailView } from "@/components/lm/StarterDetailView";

export default function Page() {
  const { journeyId } = useParams<{ journeyId: string }>();
  return (
    <RoleGate roles={["LM", "PNP", "ADMIN"]}>
      <StarterDetailView journeyId={journeyId} />
    </RoleGate>
  );
}
