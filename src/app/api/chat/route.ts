import { z } from "zod";
import { withRole } from "@/lib/auth/server";
import type { Role } from "@/lib/auth/roles";
import { MAX_QUESTION_CHARS, askAssistant, getPnpContact, takeRateLimit } from "@/server/chat-service";

const ALL_ROLES_CHAT: Role[] = ["STARTER", "BUDDY", "LM", "PNP", "ADMIN"];

const bodySchema = z.object({ question: z.string().trim().min(1).max(MAX_QUESTION_CHARS) });

/** Chat sheet bootstrap: the "Contact P&P" fallback contact. */
export const GET = withRole(ALL_ROLES_CHAT, async () => {
  return Response.json({ contact: await getPnpContact(), maxQuestionChars: MAX_QUESTION_CHARS });
});

/** FR-1.7: single-turn question, answered only from FAQ + content. Nothing is stored. */
export const POST = withRole(ALL_ROLES_CHAT, async (req, _ctx, user) => {
  // JSON only: blocks simple cross-site form posts riding on the demo cookie.
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "unsupported_media_type" }, { status: 415 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_question", message: `Ask a question of 1 to ${MAX_QUESTION_CHARS} characters.` },
      { status: 400 },
    );
  }
  const limit = takeRateLimit(user.id);
  if (!limit.ok) {
    return Response.json(
      { error: "rate_limited", message: "You're asking questions quickly. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }
  return Response.json(await askAssistant(parsed.data.question));
});
