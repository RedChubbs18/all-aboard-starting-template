export const JOB_FAMILIES = ["ENGINEERING", "DATA_AND_ANALYTICS", "OPERATIONS", "CUSTOMER_SERVICE", "RISK_AND_COMPLIANCE", "CORPORATE_FUNCTIONS"] as const;
export type JobFamily = (typeof JOB_FAMILIES)[number];

export const JOB_FAMILY_LABELS: Record<JobFamily, string> = {
  ENGINEERING: "Engineering",
  DATA_AND_ANALYTICS: "Data and analytics",
  OPERATIONS: "Operations",
  CUSTOMER_SERVICE: "Customer service",
  RISK_AND_COMPLIANCE: "Risk and compliance",
  CORPORATE_FUNCTIONS: "Corporate functions",
};

export const isJobFamily = (v: unknown): v is JobFamily => typeof v === "string" && (JOB_FAMILIES as readonly string[]).includes(v);

/** D29 device entitlement line shown on the offer letter. */
export function deviceEntitlement(f: JobFamily): string {
  return f === "ENGINEERING" ? "High-spec laptop: MacBook Pro M5 Pro or HP EliteBook U7" : "Standard laptop: MacBook Air M5 or HP EliteBook U5";
}
