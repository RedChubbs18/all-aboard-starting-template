const EMAIL = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;
export const isValidEmail = (e: string): boolean => e.length <= 254 && EMAIL.test(e);

const NAME = /^[\p{L}][\p{L}\p{M} '.-]{0,59}$/u;
export const isValidName = (n: string): boolean => NAME.test(n);

export interface CandidateInput {
  firstName: string;
  lastName: string;
  email: string;
  confirmEmail: string;
  accepted: boolean;
}

export type CandidateErrors = Partial<Record<keyof CandidateInput, string>>;

export function validateCandidate(raw: unknown): { ok: true; value: { firstName: string; lastName: string; email: string } } | { ok: false; errors: CandidateErrors } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (k: string) => (typeof r[k] === "string" ? (r[k] as string).trim() : "");
  const firstName = str("firstName");
  const lastName = str("lastName");
  const email = str("email");
  const confirmEmail = str("confirmEmail");
  const errors: CandidateErrors = {};
  if (!isValidName(firstName)) errors.firstName = "Enter your first name (letters only, up to 60 characters).";
  if (!isValidName(lastName)) errors.lastName = "Enter your last name (letters only, up to 60 characters).";
  if (!isValidEmail(email)) errors.email = "Enter a valid email address, for example name@example.com.";
  if (email.toLowerCase() !== confirmEmail.toLowerCase()) errors.confirmEmail = "The email addresses do not match.";
  if (r.accepted !== true) errors.accepted = "Tick the box to accept the conditions of this offer.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { firstName, lastName, email } };
}

/** Recruiter's create-offer input. Team and line manager are checked against MyJourney's directory by the route. */
export interface OfferInput {
  jobTitle: string;
  teamKey: string;
  lineManagerKey: string;
  startDate: string;
  conditions: string[];
}

export function validateOfferInput(raw: unknown): { ok: true; value: OfferInput } | { ok: false; error: string } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const s = (k: string) => (typeof r[k] === "string" ? (r[k] as string).trim() : "");
  const jobTitle = s("jobTitle");
  const teamKey = s("teamKey");
  const lineManagerKey = s("lineManagerKey");
  const startDate = s("startDate");
  const conditions = Array.isArray(r.conditions) ? r.conditions.filter((c): c is string => typeof c === "string").map((c) => c.trim()).filter(Boolean) : [];
  if (!jobTitle || jobTitle.length > 100) return { ok: false, error: "Job title is required (up to 100 characters)." };
  if (!teamKey || !lineManagerKey) return { ok: false, error: "Team and line manager are required." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || Number.isNaN(Date.parse(startDate))) return { ok: false, error: "Start date must be a valid date." };
  if (conditions.length > 12 || conditions.some((c) => c.length > 120)) return { ok: false, error: "Too many or too long conditions." };
  return { ok: true, value: { jobTitle, teamKey, lineManagerKey, startDate, conditions } };
}
