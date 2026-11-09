import { getAdapter } from "@/adapters/registry";
import { withRole } from "@/lib/auth/server";
import { assertCanAct, taskContext } from "../_lib/context";
import { guard, HttpError } from "../_lib/http";
import { newPhotoRef, signPhotoRef } from "../_lib/photo-token";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * FR-3.12. The image is read into memory for this request only and handed to PhotoCheckAdapter.
 * It is never written to the database or disk. On a pass we return an opaque reference plus a signed token.
 * `fileName` is passed through because the mock decides by file name (e.g. "sunglasses").
 */
export const POST = withRole(["STARTER", "LM", "PNP", "ADMIN"], (req, _ctx, user) =>
  guard(async () => {
    let form: FormData;
    try {
      form = await req.formData();
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
    if (!result.pass) return Response.json({ pass: false, issues: result.issues });
    const photoRef = newPhotoRef();
    return Response.json({ pass: true, issues: [], photoRef, token: signPhotoRef(journey.id, photoRef) });
  }),
);
