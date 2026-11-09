import { getAdapter } from "@/adapters/registry";
import { ADAPTER_KEYS, type AdapterKey, type JourneyState, type TaskState } from "@/domain/types";
import { applyVars, extractSteps, findLabelledUrl, formatDays } from "@/lib/markdown";
import { prisma } from "@/server/db";
import type { Day0Dto, Detail, TaskDetailResponse } from "@/components/journey/detail-types";
import { firstAdvantageSummary } from "./dto";

const isAdapterKey = (k: string | null): k is AdapterKey => !!k && (ADAPTER_KEYS as readonly string[]).includes(k);

export async function anchorDaysFor(journeyId: string): Promise<string> {
  try {
    const wd = await getAdapter("workday");
    return formatDays((await wd.getAnchorDays(journeyId)).days);
  } catch {
    return formatDays([]);
  }
}

export async function loadDay0(journeyId: string): Promise<Day0Dto | null> {
  const d = await prisma.day0Arrangement.findUnique({ where: { journeyId } });
  return d ? { where: d.where, whenAt: d.whenAt.toISOString(), who: d.who, notes: d.notes, confirmedAt: d.confirmedAt?.toISOString() ?? null } : null;
}

/** Link-outs (FR-1.9, FR-4.2). All example.test placeholders: no real systems. */
const LINKS: Record<string, { label: string; href: string }[]> = {
  "complete-vetting-steps": [{ label: "Open First Advantage", href: "https://firstadvantage.example.test/candidate" }],
  "firstadvantage-vetting-status": [{ label: "Open First Advantage", href: "https://firstadvantage.example.test/candidate" }],
  "review-flex-benefits": [{ label: "Open flex benefits", href: "https://benefits.example.test/flex" }],
  "view-mandatory-training": [{ label: "Open Workday learning", href: "https://workday.example.test/learning" }],
  "mandatory-training-checklist": [{ label: "Open Workday learning", href: "https://workday.example.test/learning" }],
  "read-contract-recap": [{ label: "Open Workday", href: "https://workday.example.test/" }],
  "ms-password-authenticator-setup": [{ label: "Open password set-up", href: "https://example.test/password-setup" }],
  "raise-it-requests": [{ label: "Open IT@LBG help", href: "https://example.test/it-help" }],
};

const SYSTEM_PROVIDER: Record<string, string> = {
  "internal-account-created": "Microsoft Entra (identity)",
  "sailpoint-persona-applied": "SailPoint",
  "colleague-file-id-created": "SailPoint",
  "guest-invite-sent": "Microsoft Entra (identity)",
  "epture-access-granted": "Epture",
  "pev-steps-reminder": "Notifications",
  "photo-check-passed": "Photo check",
  "order-photo-id-pass": "Pass printing",
};

async function detailFor(journey: JourneyState, t: TaskState, bodyMd: string): Promise<Detail> {
  const jid = journey.id;
  const k = t.key;

  if (k === "choose-peripherals" && t.adapterKey === "equipment") {
    const eq = await getAdapter("equipment");
    return { kind: "order", mode: "peripherals", choice: await eq.getChoice(jid) };
  }
  if (k === "upload-pass-photo") {
    const pass = await getAdapter("pass");
    const review = journey.tasks.find((x) => x.key === "photo-check-passed")?.status === "BLOCKED";
    const confirm = journey.tasks.find((x) => x.key === "confirm-day-0-arrangements" && x.applicable);
    return {
      kind: "photo",
      day0: await loadDay0(jid),
      day0Confirmed: confirm?.status === "DONE",
      confirmTaskId: confirm?.id ?? null,
      order: await pass.getOrder(jid),
      reviewRequested: !!review,
    };
  }
  if (k === "confirm-day-0-arrangements" || k === "propose-day-0-arrangements") {
    return { kind: "day0", role: k === "confirm-day-0-arrangements" ? "confirm" : "proposal", day0: await loadDay0(jid) };
  }
  if (k === "find-your-way-on-day-one") return { kind: "day0", role: "wayfinding", day0: await loadDay0(jid) };
  if (k === "draft-30-60-90-goals" || k === "agree-30-60-90-goals" || k === "cascade-performance-goals" || k === "read-performance-goals") return { kind: "goals" };

  switch (t.type) {
    case "BOOKING": {
      const b = await getAdapter("booking");
      return { kind: "booking", sessions: await b.listSessions(), booking: await b.getBooking(jid) };
    }
    case "ORDER": {
      if (t.adapterKey === "equipment") {
        const eq = await getAdapter("equipment");
        return { kind: "order", mode: k === "order-home-working-items" ? "home" : "device", choice: await eq.getChoice(jid) };
      }
      break;
    }
    case "TRAINING": {
      const wd = await getAdapter("workday");
      return { kind: "training", items: await wd.getTraining(jid) };
    }
    case "VIDEO":
      return { kind: "video", url: findLabelledUrl(bodyMd, "Video URL") };
    case "CHECKLIST": {
      const steps = extractSteps(bodyMd);
      if (steps.length) return { kind: "checklist", steps };
      break;
    }
    case "INTEGRATION_STATUS": {
      if (t.adapterKey === "firstadvantage") {
        const status = await firstAdvantageSummary(jid);
        if (status) return { kind: "firstadvantage", status };
      }
      let statusText = t.status === "DONE" ? "Complete" : t.status === "BLOCKED" ? "Needs attention" : t.status === "IN_PROGRESS" ? "In progress" : t.status === "LOCKED" ? "Not started yet" : "Waiting";
      let updatedAt: string | null = t.completedAt?.toISOString() ?? null;
      if (isAdapterKey(t.adapterKey) && t.adapterKey !== "chatbot" && t.adapterKey !== "photocheck") {
        try {
          const a = await getAdapter(t.adapterKey);
          const s = await a.getStatus(jid);
          // Mocks report the epoch when nothing has been written yet: show no timestamp then.
          updatedAt = new Date(s.updatedAt).getFullYear() > 2000 ? s.updatedAt : updatedAt;
          if (t.status !== "DONE") statusText = s.status.replace(/_/g, " ");
        } catch {
          /* adapter unavailable: fall back to the task status */
        }
      }
      return { kind: "system", provider: SYSTEM_PROVIDER[k] ?? "An external system", statusText, updatedAt };
    }
  }
  if (k === "collect-equipment") {
    const eq = await getAdapter("equipment");
    return { kind: "collect", choice: await eq.getChoice(jid) };
  }
  if (t.owner === "SYSTEM") {
    return { kind: "system", provider: SYSTEM_PROVIDER[k] ?? "An external system", statusText: t.status === "DONE" ? "Complete" : "Waiting", updatedAt: t.completedAt?.toISOString() ?? null };
  }
  return { kind: "none" };
}

export async function buildTaskDetail(journey: JourneyState, t: TaskState, hideOtherOwners = false): Promise<Pick<TaskDetailResponse, "content" | "detail" | "links" | "waitingFor">> {
  let content: TaskDetailResponse["content"] = null;
  if (t.contentSlug) {
    const c = await prisma.contentItem.findUnique({ where: { slug: t.contentSlug } });
    if (c) {
      const anchorDays = c.body.includes("{{") ? await anchorDaysFor(journey.id) : "";
      content = { slug: c.slug, title: c.title, type: c.type, body: applyVars(c.body, { anchorDays }) };
    }
  }
  const detail = await detailFor(journey, t, content?.body ?? "");
  const waitingFor =
    t.status === "LOCKED"
      ? t.dependsOn
          .map((key) => journey.tasks.find((x) => x.key === key))
          .filter((d): d is TaskState => !!d && d.applicable && d.status !== "DONE" && !d.optional)
          .filter((d) => !hideOtherOwners || d.owner === "STARTER" || d.owner === "SYSTEM")
          .map((d) => ({ key: d.key, title: d.title }))
      : [];
  return { content, detail, links: LINKS[t.key] ?? [], waitingFor };
}
