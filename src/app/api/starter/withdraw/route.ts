import { withRole } from "@/lib/auth/server";
import { isWithdrawReason, WITHDRAW_COMMENT_MAX } from "@/components/journey/withdraw";
import { exitJourney, loadJourneyByStarter, recordEvent } from "@/server/journey-service";
import { guard, HttpError, readJson } from "../_lib/http";

/**
 * D14: a starter withdraws from their own journey. Goes through journey-service exitJourney (status
 * exited, stage reached and reason category recorded). The optional comment and the reason source are
 * written as a second audit Event so MI can report them. Starter only, own journey only.
 */
export const POST = withRole(["STARTER"], (req, _ctx, user) =>
  guard(async () => {
    const body = await readJson<{ reason?: unknown; comment?: unknown }>(req);
    if (!isWithdrawReason(body.reason)) throw new HttpError(422, "invalid", "Choose a reason");
    let comment: string | null = null;
    if (body.comment !== undefined && body.comment !== null && body.comment !== "") {
      if (typeof body.comment !== "string" || body.comment.length > WITHDRAW_COMMENT_MAX) {
        throw new HttpError(422, "invalid", `Comments can be up to ${WITHDRAW_COMMENT_MAX} characters`);
      }
      comment = body.comment.trim() || null;
    }
    const journey = await loadJourneyByStarter(user.id);
    if (!journey) throw new HttpError(404, "no_journey", "You do not have a journey");
    if (journey.status !== "active") throw new HttpError(409, "journey_closed", `This journey is already ${journey.status}`);
    const exited = await exitJourney(journey.id, body.reason, { actorId: user.id });
    await recordEvent({
      journeyId: journey.id,
      actorId: user.id,
      type: "JOURNEY_EXIT_DETAIL",
      entity: "Journey",
      entityId: journey.id,
      from: journey.currentStage,
      to: "exited",
      data: { reason: body.reason, comment, reasonSource: "COLLEAGUE", stage: journey.currentStage },
    });
    return Response.json({ ok: true, status: exited.status, stage: exited.exitStage });
  }),
);
