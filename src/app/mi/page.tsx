"use client";
import { Suspense } from "react";
import { RoleGate } from "@/components/shell/RoleGate";
import { MiDashboard } from "@/components/mi/MiDashboard";

export default function Page() {
  return (
    <RoleGate roles={["PNP", "ADMIN"]}>
      <Suspense fallback={<p role="status" className="text-text-muted">Loading...</p>}>
        <MiDashboard />
      </Suspense>
    </RoleGate>
  );
}
