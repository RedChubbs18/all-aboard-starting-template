import { beforeEach, describe, expect, it, vi } from "vitest";

const acquire = vi.fn();
const ctor = vi.fn();
vi.mock("@azure/msal-node", () => ({
  ConfidentialClientApplication: class {
    constructor(cfg: unknown) {
      ctor(cfg);
    }
    acquireTokenByClientCredential = acquire;
  },
}));

import { externalInvitesApproved, getGraphToken, graphCredentials, resetGraphTokenCache } from "./graphAuth";

const creds = { tenantId: "tenant-1", clientId: "client-1", clientSecret: "s3cret-value" };
beforeEach(() => {
  acquire.mockReset();
  ctor.mockReset();
  resetGraphTokenCache();
});

describe("graphCredentials", () => {
  it("needs tenant, client id and secret; tenant falls back to NEXT_PUBLIC_ENTRA_TENANT_ID", () => {
    expect(graphCredentials({ WORKDAY_GRAPH_CLIENT_ID: "c", WORKDAY_GRAPH_CLIENT_SECRET: "s" })).toBeNull();
    expect(graphCredentials({ NEXT_PUBLIC_ENTRA_TENANT_ID: "t", WORKDAY_GRAPH_CLIENT_ID: "c", WORKDAY_GRAPH_CLIENT_SECRET: "s" })).toEqual({ tenantId: "t", clientId: "c", clientSecret: "s" });
    expect(graphCredentials({ WORKDAY_GRAPH_TENANT_ID: "a", NEXT_PUBLIC_ENTRA_TENANT_ID: "t", WORKDAY_GRAPH_CLIENT_ID: "c", WORKDAY_GRAPH_CLIENT_SECRET: "s" })?.tenantId).toBe("a");
  });
});

describe("externalInvitesApproved", () => {
  it("reads the server variable, falling back to the old NEXT_PUBLIC_ name", () => {
    expect(externalInvitesApproved({ GRAPH_INVITE_EXTERNAL_APPROVED: "yes" })).toBe(true);
    expect(externalInvitesApproved({ NEXT_PUBLIC_GRAPH_INVITE_EXTERNAL_APPROVED: "yes" })).toBe(true);
    expect(externalInvitesApproved({ GRAPH_INVITE_EXTERNAL_APPROVED: "no", NEXT_PUBLIC_GRAPH_INVITE_EXTERNAL_APPROVED: "yes" })).toBe(false);
    expect(externalInvitesApproved({})).toBe(false);
  });
});

describe("getGraphToken", () => {
  it("returns null with no credentials and never calls msal", async () => {
    expect(await getGraphToken(null)).toBeNull();
    expect(ctor).not.toHaveBeenCalled();
  });

  it("uses the client-credential flow with the .default scope, and caches in memory", async () => {
    acquire.mockResolvedValue({ accessToken: "tok-1", expiresOn: new Date(Date.now() + 3600_000) });
    expect(await getGraphToken(creds)).toBe("tok-1");
    expect(await getGraphToken(creds)).toBe("tok-1");
    expect(acquire).toHaveBeenCalledTimes(1);
    expect(acquire).toHaveBeenCalledWith({ scopes: ["https://graph.microsoft.com/.default"] });
    const cfg = ctor.mock.calls[0][0] as { auth: { authority: string; clientId: string; clientSecret: string } };
    expect(cfg.auth.authority).toBe("https://login.microsoftonline.com/tenant-1");
    expect(cfg.auth.clientId).toBe("client-1");
    expect(cfg.auth.clientSecret).toBe("s3cret-value");
  });

  it("refreshes a token that is about to expire", async () => {
    acquire.mockResolvedValueOnce({ accessToken: "old", expiresOn: new Date(Date.now() + 60_000) }).mockResolvedValueOnce({ accessToken: "new", expiresOn: new Date(Date.now() + 3600_000) });
    expect(await getGraphToken(creds)).toBe("old");
    expect(await getGraphToken(creds)).toBe("new");
  });

  it("returns null when msal gives no token", async () => {
    acquire.mockResolvedValue(null);
    expect(await getGraphToken(creds)).toBeNull();
  });
});
