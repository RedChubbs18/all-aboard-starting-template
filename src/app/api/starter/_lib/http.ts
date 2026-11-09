import { EngineError } from "@/domain/engine";
import { NotFoundError, ValidationError } from "@/server/journey-service";

/** Thrown inside handlers; converted to a JSON error by `guard`. */
export class HttpError extends Error {
  constructor(
    public status: 400 | 403 | 404 | 409 | 422,
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

/** Maps domain errors to HTTP. Auth errors are handled by withRole before this runs. */
export async function guard(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof HttpError) return Response.json({ error: e.code, message: e.message }, { status: e.status });
    if (e instanceof NotFoundError) return Response.json({ error: "not_found", message: e.message }, { status: 404 });
    if (e instanceof ValidationError) return Response.json({ error: "invalid", message: e.message }, { status: 422 });
    if (e instanceof EngineError) return Response.json({ error: "conflict", message: e.message }, { status: 409 });
    throw e;
  }
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "bad_json", "Request body must be JSON");
  }
}

export const str = (v: unknown, max = 200): string | null => (typeof v === "string" && v.trim() && v.length <= max ? v.trim() : null);
