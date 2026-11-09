import { LOGIN_SCOPES } from "./config";

/**
 * D25: every interactive Entra sign-in shows the account picker, so a personal SSO session on the
 * device never signs in silently as the wrong person.
 */
export function buildLoginRequest(scopes: string[] = LOGIN_SCOPES) {
  return { scopes, prompt: "select_account" as const };
}
