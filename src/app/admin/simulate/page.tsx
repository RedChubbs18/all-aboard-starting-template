"use client";

import { RoleGate } from "@/components/shell/RoleGate";
import { SimulatePanel } from "@/components/simulate/SimulatePanel";

export default function Page() {
  return (
    <RoleGate roles={["ADMIN", "PNP"]}>
      <SimulatePanel />
    </RoleGate>
  );
}
