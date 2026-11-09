/**
 * Shared plumbing for the LM API: role wrapper, scoping and error mapping.
 * An LM only ever reaches journeys where lmId is themselves (server-side, every route).
 */
import type { Prisma } from "@prisma/client";
import type { ZodType } from "zod";
import { EngineError } from "@/domain/engine";
import { canManageJourney, journeyScopeWhere } from "@/lib/auth/access";
import { hasAnyRole, type SessionUser } from "@/lib/auth/roles";
import { withRole } from "@/lib/auth/server";
import { prisma } from "@/server/db";
import { NotFoundError, ValidationError } from "@/server/journey-service";
import { fieldErrors } from "@/components/lm/schemas";

export class HttpError extends Error {
  constructor(
    public status: 400 | 403 | 404 | 409,
    public code: string,
    message?: string,
    public fields?: Record<string, string>,
  ) {
    super(message ?? code);
  }
}

export interface JourneyParams {
  params: Promise<{ journeyId: string }>;
}

type Handler<C> = (req: Request, ctx: C, user: SessionUser) => Promise<Response> | Response;

/** LM routes: LM role (PNP/ADMIN may also view/manage via the shared access helpers). */
export function lmRoute<C = unknown>(handler: Handler<C>) {
  return withRole<C>(["LM", "PNP", "ADMIN"], async (req, ctx, user) => {
    try {
      return await handler(req, ctx, user);
    } catch (e) {
      if (e instanceof HttpError) {
        return Response.json({ error: e.code, message: e.message, fields: e.fields }, { status: e.status });
      }
      if (e instanceof NotFoundError) return Response.json({ error: "not_found", message: e.message }, { status: 404 });
      if (e instanceof ValidationError) return Response.json({ error: "invalid", message: e.message }, { status: 400 });
      if (e instanceof EngineError) return Response.json({ error: "conflict", message: e.message }, { status: 409 });
      throw e; // withRole turns this into a 500
    }
  });
}

/** Journeys the caller may list. A plain LM is limited to lmId = self (never buddy/starter journeys). */
export function lmScope(user: SessionUser): Prisma.JourneyWhereInput {
  return hasAnyRole(user, "PNP", "ADMIN") ? journeyScopeWhere(user) : { lmId: user.id };
}

/** Loads the journey row and enforces canManageJourney. 404 if missing, 403 if it is not the caller's starter. */
export async function requireManagedJourney(journeyId: string, user: SessionUser) {
  const j = await prisma.journey.findUnique({ where: { id: journeyId } });
  if (!j) throw new HttpError(404, "not_found", "Starter not found");
  if (!canManageJourney(user, j)) throw new HttpError(403, "forbidden", "This starter is not on your team");
  return j;
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be JSON");
  }
  const r = schema.safeParse(raw);
  if (!r.success) {
    const fields = fieldErrors(r.error);
    throw new HttpError(400, "invalid", Object.values(fields)[0] ?? "Invalid request", fields);
  }
  return r.data;
}
