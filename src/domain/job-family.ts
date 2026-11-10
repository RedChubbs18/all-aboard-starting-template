// D29: the job family comes from the Workday offer and decides the device entitlement. Pure, no imports.

export const JOB_FAMILIES = [
  "ENGINEERING",
  "DATA_AND_ANALYTICS",
  "OPERATIONS",
  "CUSTOMER_SERVICE",
  "RISK_AND_COMPLIANCE",
  "CORPORATE_FUNCTIONS",
] as const;
export type JobFamily = (typeof JOB_FAMILIES)[number];

export const isJobFamily = (v: unknown): v is JobFamily => typeof v === "string" && (JOB_FAMILIES as readonly string[]).includes(v);

export const JOB_FAMILY_LABELS: Record<JobFamily, string> = {
  ENGINEERING: "Engineering",
  DATA_AND_ANALYTICS: "Data and analytics",
  OPERATIONS: "Operations",
  CUSTOMER_SERVICE: "Customer service",
  RISK_AND_COMPLIANCE: "Risk and compliance",
  CORPORATE_FUNCTIONS: "Corporate functions",
};

export type DeviceTier = "HIGH" | "STANDARD";

/** Engineering gets the high-spec tier; every other family (or an unknown one) gets the standard tier. */
export const deviceTierFor = (jobFamily: string | null | undefined): DeviceTier => (jobFamily === "ENGINEERING" ? "HIGH" : "STANDARD");
