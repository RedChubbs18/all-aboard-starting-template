"use client";
import { RoleGate } from "@/components/shell/RoleGate";
import { FaqHelp } from "@/components/chat/FaqHelp";

/** FR-1.7: searchable FAQs and the grounded assistant. All signed-in roles. */
export default function Page() {
  return (
    <RoleGate roles={["STARTER", "BUDDY", "LM", "PNP", "ADMIN"]}>
      <FaqHelp />
    </RoleGate>
  );
}
