import type { TemplateInput } from "./types";

const base = { description: "", source: "CORE" as const, dependsOn: [] as string[], gating: false, dueOffsetDays: 0 };

/** Small template set covering every stage, a dependency chain, a condition and a TEAM task. */
export const TEMPLATES: TemplateInput[] = [
  { ...base, key: "intro", title: "Welcome", stage: "CONDITIONAL_OFFER", owner: "STARTER", type: "INFO", dueOffsetDays: -30, gating: true },
  { ...base, key: "contract", title: "Contract recap", stage: "CONDITIONAL_OFFER", owner: "STARTER", type: "INFO", dueOffsetDays: -28, dependsOn: ["intro"] },
  { ...base, key: "pev-hireview", title: "Vetting status", stage: "PEV", owner: "SYSTEM", type: "INTEGRATION_STATUS", dueOffsetDays: -21, adapterKey: "hireview", gating: true },
  { ...base, key: "internal-account", title: "Internal account", stage: "UNCONDITIONAL_OFFER", owner: "SYSTEM", type: "INTEGRATION_STATUS", dueOffsetDays: -10, adapterKey: "identity", gating: true },
  { ...base, key: "it-request", title: "Raise IT request", stage: "UNCONDITIONAL_OFFER", owner: "LM", type: "ORDER", dueOffsetDays: -7, dependsOn: ["internal-account"], adapterKey: "itrequest" },
  { ...base, key: "book-induction", title: "Book induction", stage: "UNCONDITIONAL_OFFER", owner: "STARTER", type: "BOOKING", dueOffsetDays: -5, adapterKey: "booking" },
  { ...base, key: "team-checklist", title: "Team checklist", stage: "UNCONDITIONAL_OFFER", owner: "LM", type: "CHECKLIST", dueOffsetDays: -5, source: "TEAM", teamId: "team-a" },
  { ...base, key: "other-team", title: "Other team task", stage: "UNCONDITIONAL_OFFER", owner: "LM", type: "CHECKLIST", dueOffsetDays: -5, source: "TEAM", teamId: "team-b" },
  { ...base, key: "collect", title: "Collect equipment", stage: "DAY_0", owner: "STARTER", type: "ACTION", dueOffsetDays: 0, gating: true },
  { ...base, key: "induction-fallback", title: "Book induction (fallback)", stage: "DAY_0", owner: "STARTER", type: "BOOKING", dueOffsetDays: 0, condition: "notDone:book-induction" },
  { ...base, key: "goals", title: "Performance goals", stage: "DAY_30", owner: "STARTER", type: "INFO", dueOffsetDays: 30, gating: true },
];
