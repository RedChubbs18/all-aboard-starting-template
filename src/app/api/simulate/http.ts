import { z } from "zod";
import { SimulationError } from "@/server/integration-service";
import { NotFoundError, ValidationError } from "@/server/journey-service";
import { EngineError } from "@/domain/engine";

/** Maps service errors to JSON responses. Returns null for unknown errors so withRole logs them as 500. */
export function errorResponse(e: unknown): Response | null {
  if (e instanceof SimulationError) return Response.json({ error: "simulation_error", message: e.message }, { status: e.status });
  if (e instanceof NotFoundError) return Response.json({ error: "not_found", message: e.message }, { status: 404 });
  if (e instanceof ValidationError || e instanceof EngineError) return Response.json({ error: "invalid", message: e.message }, { status: 409 });
  return null;
}

export async function readJson<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S> | Response> {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid_body", message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
  }
  return parsed.data;
}

/** Wraps a handler body so service errors become JSON responses. */
export async function guarded(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    const r = errorResponse(e);
    if (r) return r;
    throw e;
  }
}
