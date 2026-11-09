"use client";

import { RoleGate } from "@/components/shell/RoleGate";
import { StarterList } from "@/components/lm/StarterList";

export default function Page() {
  return (
    <RoleGate roles={["LM", "PNP", "ADMIN"]}>
      <StarterList />
    </RoleGate>
  );
}
