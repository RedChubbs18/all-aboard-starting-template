import { getAdapter } from "@/adapters/registry";
import { withRole } from "@/lib/auth/server";
import { takePhotoRateLimit } from "@/server/chat-service";
import { recordEvent, requestPhotoReview } from "@/server/journey-service";
import { assertCanAct, taskContext } from "../_lib/context";
import { guard, HttpError } from "../_lib/http";
import { newPhotoRef, signPhotoRef } from "../_lib/photo-token";

const MAX_BYTES = 5 * 1024 * 1024;
/** Whole multipart body: the 5 MB photo plus form overhead. Checked before anything is parsed. */
const MAX_BODY_BYTES = 5.5 * 1024 * 1024;

const PENDING_REVIEW_MESSAGE = "Your photo will be reviewed by your line manager or P&P.";

const tooLarge = () => Response.json({ error: "too_large", message: "That photo is over 5 MB. Please choose a smaller one" }, { status: 413 });

/** Reads the body with a hard byte cap, so a missing or lying content-length cannot exhaust memory. */
async function readCapped(req: Request, cap: number): Promise<Uint8Array | null> {
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

/**
 * FR-3.12. The image is read into memory for this request only and handed to PhotoCheckAdapter.
 * It is never written to the database or disk. On a pass we return an opaque reference plus a signed token.
 * `fileName` is passed through because the mock decides by file name (e.g. "sunglasses"); the REAL adapter ignores it.
 * If the automated check cannot run (`needsManualReview`), no token is issued: the photo is queued for an LM / P&P
 * review exactly like the photo-review route, and the response is `{ pass: false, pendingReview: true }`.
 */
export const POST = withRole(
  ["STARTER", "LM", "PNP", "ADMIN"],
  (req, _ctx, user) =>
    guard(async () => {
      const declared = Number(req.headers.get("content-length") ?? "");
      if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return tooLarge();

      const limit = takePhotoRateLimit(user.id);
      if (!limit.ok) {
        return Response.json(
          { error: "rate_limited", message: "You've checked several photos in a short time. Please wait a few minutes and try again." },
          { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
        );
      }

      const raw = await readCapped(req, MAX_BODY_BYTES);
      if (!raw) return tooLarge();
      let form: FormData;
      try {
        form = await new Response(raw as BodyInit, { headers: { "content-type": req.headers.get("content-type") ?? "" } }).formData();
      } catch {
        throw new HttpError(400, "bad_request", "Send the photo as multipart form data");
      }
      const taskId = form.get("taskId");
      const file = form.get("photo");
      if (typeof taskId !== "string" || !(file instanceof File)) throw new HttpError(400, "bad_request", "taskId and photo are required");
      if (!file.type.startsWith("image/")) throw new HttpError(422, "invalid", "Please choose an image file (JPEG or PNG)");
      if (file.size > MAX_BYTES) throw new HttpError(422, "invalid", "That photo is over 5 MB. Please choose a smaller one");
      const { journey, task } = await taskContext(user, taskId);
      assertCanAct(user, journey, task);
      if (task.key !== "upload-pass-photo") throw new HttpError(409, "wrong_task", "This task does not take a photo");
      if (task.status === "LOCKED") throw new HttpError(409, "locked", "This task is locked");

      const image = new Uint8Array(await file.arrayBuffer());
      const adapter = await getAdapter("photocheck");
      let result;
      try {
        result = await adapter.check({ image, fileName: file.name, mimeType: file.type });
      } catch {
        return Response.json({ error: "check_unavailable", message: "We couldn't check your photo. Try again or ask P&P." }, { status: 502 });
      }
      if (result.needsManualReview) {
        // Fail closed (M1): never a pass token without a real check. Same review route as photo-review.
        await requestPhotoReview(journey.id, {
          actorId: user.id,
          detail: "The automated photo check was unavailable. The photo needs a manual review.",
        });
        await recordEvent({ journeyId: journey.id, actorId: user.id, type: "SUPPORT_RAISED", entity: "Task", entityId: task.id, data: { reason: "photo_check_unavailable" } });
        return Response.json({ pass: false, pendingReview: true, issues: [PENDING_REVIEW_MESSAGE] });
      }
      if (!result.pass) return Response.json({ pass: false, issues: result.issues });
      const photoRef = newPhotoRef();
      return Response.json({ pass: true, issues: [], photoRef, token: signPhotoRef(journey.id, photoRef) });
    }),
  { allowMultipart: true },
);
