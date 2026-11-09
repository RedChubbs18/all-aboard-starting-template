import { expect, it } from "vitest";
import { runAdapterContract } from "./contract";
import { memoryStore } from "./store";
import { createBookingMock } from "./booking/mock";
import { createChatbotMock } from "./chatbot/mock";
import { createEquipmentMock } from "./equipment/mock";
import { createFirstAdvantageMock } from "./firstadvantage/mock";
import { createIdentityMock } from "./identity/mock";
import { createITRequestMock } from "./itrequest/mock";
import { createNotificationMock } from "./notification/mock";
import { createPassMock } from "./pass/mock";
import { createPhotoCheckMock } from "./photocheck/mock";
import { createSailPointMock } from "./sailpoint/mock";
import { createWorkdayMock } from "./workday/mock";
import { mockFactories } from "./registry";
import { ADAPTER_KEYS } from "@/domain/types";

it("has a mock for every adapter key", () => {
  expect(Object.keys(mockFactories).sort()).toEqual([...ADAPTER_KEYS].sort());
});

runAdapterContract("identity", createIdentityMock, (make) => {
  it("invites a guest and creates an internal account without storing the personal email", async () => {
    const a = make();
    expect((await a.inviteGuest("j1", "new.starter@personal.test")).status).toBe("invited");
    await expect(a.inviteGuest("j1", "nope")).rejects.toThrow();
    const acct = await a.createInternalAccount("j1");
    expect(acct.upn.endsWith("@example.test")).toBe(true);
    expect((await a.getStatus("j1")).status).toBe("internal_created");
  });
});
runAdapterContract("sailpoint", createSailPointMock, (make) => {
  it("applies a persona", async () => {
    const a = make();
    expect((await a.applyPersona("j1")).status).toBe("applied");
    expect((await a.getStatus("j1")).status).toBe("applied");
  });
});
runAdapterContract("firstadvantage", createFirstAdvantageMock, (make) => {
  it("reports vetting status with an action link", async () => {
    const a = make();
    expect((await a.getVettingStatus("j1")).status).toBe("not_started");
    await a.simulate("j1", "action_needed", "Upload ID in First Advantage");
    const s = await a.getVettingStatus("j1");
    expect(s.status).toBe("action_needed");
    expect(s.actionUrl).toMatch(/^https:\/\//);
    expect((await a.getStatus("j1")).detail).toBe("Upload ID in First Advantage");
  });
}, { simulateStatus: "cleared" });
runAdapterContract("workday", createWorkdayMock, (make) => {
  it("returns anchor days and training", async () => {
    const a = make();
    expect((await a.getAnchorDays("j1")).days.length).toBeGreaterThan(0);
    const t = await a.getTraining("j1");
    expect(t[0]).toMatchObject({ id: expect.any(String), status: expect.stringMatching(/NOT_STARTED|IN_PROGRESS|COMPLETE/) });
  });
});
runAdapterContract("itrequest", createITRequestMock, () => {
  it("raises and lists requests", async () => {
    const store = memoryStore();
    await createSailPointMock(store).createColleagueFileId("j1"); // FR-3.3: raising needs the Colleague File ID
    const a = createITRequestMock(store);
    const r = await a.raise("j1", "GitHub access");
    expect(r.ref).toMatch(/^ITR-/);
    await a.raise("j1", "VPN");
    expect((await a.list("j1")).map((x) => x.item)).toEqual(["GitHub access", "VPN"]);
  });
});
runAdapterContract("equipment", createEquipmentMock, (make) => {
  it("submits a device choice and returns the collection point", async () => {
    const a = make();
    expect(await a.getChoice("j1")).toBeNull();
    const c = await a.submitChoice("j1", { device: "MAC", peripherals: ["Monitor"] });
    expect(c.collectionPoint).toBeTruthy();
    expect(await a.getChoice("j1")).toMatchObject({ device: "MAC", peripherals: ["Monitor"] });
    await expect(a.submitChoice("j1", { device: "LINUX" as never, peripherals: [] })).rejects.toThrow();
  });
});
runAdapterContract("pass", createPassMock, (make) => {
  it("orders a pass to a location", async () => {
    const a = make();
    const o = await a.orderPass("j1", { photoRef: "photo-1", location: "Floor 3 reception" });
    expect(o.status).toBe("ordered");
    expect((await a.getOrder("j1"))!.location).toBe("Floor 3 reception");
    await expect(a.orderPass("j1", { photoRef: "", location: "x" })).rejects.toThrow();
  });
});
runAdapterContract("booking", createBookingMock, (make) => {
  it("lists sessions, books one, and tracks capacity", async () => {
    const a = make();
    const [first] = await a.listSessions();
    await a.book("j1", first.id);
    expect((await a.getBooking("j1"))!.sessionId).toBe(first.id);
    expect((await a.listSessions())[0].remaining).toBe(first.remaining - 1);
    await expect(a.book("j1", "nope")).rejects.toThrow();
  });
});
runAdapterContract("photocheck", createPhotoCheckMock, (make) => {
  it("returns { pass, issues }", async () => {
    const a = make();
    expect(await a.check({ fileName: "me.jpg" })).toEqual({ pass: true, issues: [] });
    const bad = await a.check({ fileName: "me-sunglasses.jpg" });
    expect(bad.pass).toBe(false);
    expect(bad.issues.length).toBeGreaterThan(0);
    expect((await a.check({})).pass).toBe(false);
  });
});
runAdapterContract("chatbot", createChatbotMock, (make) => {
  const corpus = {
    faqs: [{ id: "faq-pay", question: "When do I get paid?", answer: "Last working day of the month.", tags: ["pay", "salary"] }],
    content: [{ slug: "device-guide", title: "Choosing your device", summary: "Mac or Windows laptop options.", body: "" }],
  };
  it("cites the source FAQ", async () => {
    const r = await make().ask("When is pay day, how do I get paid?", corpus);
    expect(r).toEqual({ answer: "Last working day of the month.", citations: [{ kind: "faq", id: "faq-pay" }], fallback: false });
  });
  it("falls back to content, then to P&P", async () => {
    const a = make();
    expect((await a.ask("Which laptop device options exist?", corpus)).citations[0]).toEqual({ kind: "content", id: "device-guide" });
    const none = await a.ask("What is the airspeed of a swallow?", corpus);
    expect(none).toMatchObject({ citations: [], fallback: true });
  });
});
runAdapterContract("notification", createNotificationMock, (make) => {
  it("sends and lists notifications", async () => {
    const a = make();
    await a.send({ toUserId: "u1", kind: "PEV_REMINDER", subject: "Reminder", body: "x", journeyId: "j1" });
    await a.send({ toUserId: "u2", kind: "GENERAL", subject: "Hi", body: "y" });
    expect(await a.list({ toUserId: "u1" })).toHaveLength(1);
    expect(await a.list()).toHaveLength(2);
    await expect(a.send({ toUserId: "", kind: "GENERAL", subject: "", body: "" })).rejects.toThrow();
  });
});
