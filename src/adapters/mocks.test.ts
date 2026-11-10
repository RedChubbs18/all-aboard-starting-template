import { entitledModels } from "./equipment/catalogue";
import { describe, expect, it } from "vitest";
import { memoryStore } from "./store";
import { createBookingMock, sessionsFrom } from "./booking/mock";
import { createEquipmentMock } from "./equipment/mock";
import { createFirstAdvantageMock } from "./firstadvantage/mock";
import { createIdentityMock } from "./identity/mock";
import { createITRequestMock } from "./itrequest/mock";
import { ColleagueFileIdMissingError } from "./itrequest/types";
import { createNotificationMock } from "./notification/mock";
import { createPassMock } from "./pass/mock";
import { createPhotoCheckMock } from "./photocheck/mock";
import { createSailPointMock } from "./sailpoint/mock";
import { createWorkdayMock } from "./workday/mock";

describe("identity mock", () => {
  it("walks invite, account creation and conditional access without storing the personal email", async () => {
    const store = memoryStore();
    const a = createIdentityMock(store);
    await a.inviteGuest("j1", "private.person@personal.test");
    expect(await a.getAccount("j1")).toMatchObject({ status: "invited", conditionalAccess: "guest-restricted", upn: null });
    await a.createInternalAccount("j1");
    expect(await a.getAccount("j1")).toMatchObject({ status: "internal_created", conditionalAccess: "pre-start" });
    expect(JSON.stringify(await store.get("j1", "identity"))).not.toContain("personal.test");
  });
});

describe("sailpoint mock", () => {
  it("applies a persona and generates a stable Colleague File ID", async () => {
    const a = createSailPointMock(memoryStore());
    expect(await a.getColleagueFileId("j1")).toBeNull();
    await a.applyPersona("j1");
    expect(await a.getPersona("j1")).toBe("Pre-start colleague");
    const id = await a.createColleagueFileId("j1");
    expect(id.id).toMatch(/^CF-\d{6}$/);
    expect((await a.createColleagueFileId("j1")).id).toBe(id.id);
    expect((await a.getStatus("j1")).status).toBe("file_id_created");
    expect(await a.getPersona("j1")).toBe("Pre-start colleague"); // kept
  });
});

describe("firstadvantage mock", () => {
  it("supplies a what's-needed message and a test link for every status", async () => {
    const a = createFirstAdvantageMock(memoryStore());
    for (const s of a.simulatableStatuses) {
      await a.simulate("j1", s);
      const v = await a.getVettingStatus("j1");
      expect(v.status).toBe(s);
      expect(v.message).toBeTruthy();
      expect(v.actionUrl).toContain("example.test");
    }
  });
  it("reads upper-case seeded statuses", async () => {
    const store = memoryStore();
    await store.set("j1", "firstadvantage", "ACTION_NEEDED", {});
    expect((await createFirstAdvantageMock(store).getVettingStatus("j1")).status).toBe("action_needed");
  });
});

describe("workday mock", () => {
  it("returns per-starter anchor days, with the demo starter pinned", async () => {
    const a = createWorkdayMock(memoryStore());
    expect((await a.getAnchorDays("journey-alex-morgan")).summary).toBe("Tuesday and Thursday");
    expect((await a.getAnchorDays("j-other")).days).toHaveLength(2);
    expect(await a.getAnchorDays("j-other")).toEqual(await a.getAnchorDays("j-other"));
  });
  it("lists five courses and persists status changes per starter", async () => {
    const a = createWorkdayMock(memoryStore());
    const t = await a.getTraining("journey-alex-morgan");
    expect(t).toHaveLength(5);
    expect(t.every((x) => x.status === "NOT_STARTED")).toBe(true);
    await a.setTrainingStatus("journey-alex-morgan", "wd-conduct", "COMPLETE");
    expect((await a.getTraining("journey-alex-morgan"))[0].status).toBe("COMPLETE");
    await expect(a.setTrainingStatus("journey-alex-morgan", "nope", "COMPLETE")).rejects.toThrow();
  });
});

describe("itrequest mock (FR-3.3)", () => {
  it("refuses with a typed error until SailPoint has generated the Colleague File ID", async () => {
    const store = memoryStore();
    const it1 = createITRequestMock(store);
    await expect(it1.raise("j1", "VPN")).rejects.toBeInstanceOf(ColleagueFileIdMissingError);
    expect(await it1.canRaise("j1")).toMatchObject({ allowed: false });
    await createSailPointMock(store).simulate("j1", "file_id_created");
    expect((await it1.raise("j1", "VPN")).ref).toMatch(/^ITR-/);
    expect(await it1.canRaise("j1")).toEqual({ allowed: true });
    await expect(it1.raise("j2", "VPN")).rejects.toBeInstanceOf(ColleagueFileIdMissingError); // per journey
  });
});

describe("equipment mock", () => {
  it("offers a catalogue, honours the collection point and orders home-working items", async () => {
    const a = createEquipmentMock(memoryStore());
    const cat = await a.getCatalogue();
    // D29: two tiers, one Mac and one Windows model in each.
    expect(cat.devices.map((d) => d.label).sort()).toEqual(["HP EliteBook U5", "HP EliteBook U7", "MacBook Air M5", "MacBook Pro M5 Pro"]);
    expect(entitledModels("ENGINEERING").map((d) => d.label)).toEqual(["MacBook Pro M5 Pro", "HP EliteBook U7"]);
    for (const f of ["OPERATIONS", "DATA_AND_ANALYTICS", "CUSTOMER_SERVICE", "RISK_AND_COMPLIANCE", "CORPORATE_FUNCTIONS", null]) {
      expect(entitledModels(f).map((d) => d.label)).toEqual(["MacBook Air M5", "HP EliteBook U5"]);
    }
    expect(cat.collectionPoints.map((c) => c.id)).toEqual(["TECH_BAR", "MAILROOM"]);
    const c = await a.submitChoice("j1", { device: "WINDOWS", modelId: "hp-elitebook-u7", peripherals: ["Monitor"], collectionPoint: "MAILROOM" });
    expect(c.collectionPoint).toMatch(/^Mailroom/);
    expect(c).toMatchObject({ device: "WINDOWS", modelId: "hp-elitebook-u7", model: "HP EliteBook U7" });
    await expect(a.submitChoice("j1", { device: "MAC", modelId: "hp-elitebook-u7", peripherals: [] })).rejects.toThrow(); // model must match the device
    await expect(a.submitChoice("j1", { device: "MAC", modelId: "nope", peripherals: [] })).rejects.toThrow();
    await expect(a.submitChoice("j1", { device: "MAC", peripherals: [], collectionPoint: "ATTIC" as never })).rejects.toThrow();
    const o = await a.orderHomeWorking("j1", ["desk", "chair"]);
    expect(o.items).toEqual(["Height-adjustable desk", "Office chair"]);
    await expect(a.orderHomeWorking("j1", ["jetpack"])).rejects.toThrow();
  });
});

describe("pass mock", () => {
  it("takes only an opaque photo reference, never image data", async () => {
    const store = memoryStore();
    const a = createPassMock(store);
    const o = await a.orderPass("j1", { photoRef: "sha256:ab12cd34", location: "Floor 3 reception" });
    expect(o.ref).toMatch(/^PASS-/);
    await expect(a.orderPass("j1", { photoRef: "data:image/png;base64,AAAA", location: "x" })).rejects.toThrow(/opaque/);
    await expect(a.orderPass("j1", { photoRef: "A".repeat(500), location: "x" })).rejects.toThrow();
    expect(JSON.stringify(await store.get("j1", "pass"))).not.toContain("base64");
  });
});

describe("booking mock", () => {
  it("offers the next three monthly sessions on a Tuesday, in the future", () => {
    const now = new Date("2026-11-09T10:00:00Z");
    const s = sessionsFrom(now);
    expect(s).toHaveLength(3);
    expect(s.map((x) => x.id)).toEqual(["ind-2026-12", "ind-2027-01", "ind-2027-02"]);
    for (const x of s) {
      expect(new Date(x.startsAt).getUTCDay()).toBe(2);
      expect(new Date(x.startsAt) > now).toBe(true);
      expect(x.title).toBe("Welcome to Lloyds");
    }
  });
  it("tracks capacity, rebooking and cancellation", async () => {
    const a = createBookingMock(memoryStore());
    const [s1, s2] = await a.listSessions();
    await a.book("j1", s1.id);
    await a.book("j1", s2.id); // move
    const after = await a.listSessions();
    expect(after[0].remaining).toBe(s1.remaining);
    expect(after[1].remaining).toBe(s2.remaining - 1);
    await a.cancelBooking("j1");
    expect((await a.listSessions())[1].remaining).toBe(s2.remaining);
    expect(await a.getBooking("j1")).toBeNull();
  });
});

describe("photocheck mock", () => {
  it("flags sunglasses, hats and blur by file name, and passes the rest", async () => {
    const a = createPhotoCheckMock(memoryStore());
    expect((await a.check({ fileName: "alex-hat.jpg" })).pass).toBe(false);
    expect((await a.check({ fileName: "alex_blurry.png" })).pass).toBe(false);
    expect((await a.check({ fileName: "SUNGLASSES.JPG" })).issues[0]).toMatch(/sunglasses/i);
    const multi = await a.check({ fileName: "hat-sunglasses-blur.jpg" });
    expect(multi.issues).toHaveLength(3);
    for (const ok of ["alex.jpg", "chat-photo.jpg", "what.png", "photo-capture.jpg"]) expect((await a.check({ fileName: ok })).pass).toBe(true);
    expect((await a.check({ fileName: "a.pdf", mimeType: "application/pdf" })).pass).toBe(false);
  });
});

describe("notification mock", () => {
  it("records per recipient with link and read flag, and marks read only for the recipient", async () => {
    const a = createNotificationMock(memoryStore());
    const n = await a.send({ toUserId: "u1", kind: "PEV_REMINDER", subject: "S", body: "B", link: "/journey", journeyId: "j1" });
    await a.send({ toUserId: "u2", kind: "CHASE_LM", subject: "Nudge", body: "B" });
    expect(n).toMatchObject({ read: false, link: "/journey" });
    expect(await a.unreadCount("u1")).toBe(1);
    expect(await a.markRead(n.id, "u2")).toBe(false);
    expect(await a.markRead(n.id, "u1")).toBe(true);
    expect(await a.unreadCount("u1")).toBe(0);
    expect(await a.unreadCount("u2")).toBe(1);
    expect(await a.clearJourney("j1")).toBe(1);
    expect(await a.list({ toUserId: "u1" })).toHaveLength(0);
  });
});
