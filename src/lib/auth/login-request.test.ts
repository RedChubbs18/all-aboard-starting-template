import { describe, expect, it } from "vitest";
import { LOGIN_SCOPES } from "./config";
import { buildLoginRequest } from "./login-request";

describe("buildLoginRequest", () => {
  it("always asks for the account picker (D25)", () => {
    expect(buildLoginRequest()).toEqual({ scopes: LOGIN_SCOPES, prompt: "select_account" });
    expect(buildLoginRequest(["User.Invite.All"]).prompt).toBe("select_account");
  });
});
