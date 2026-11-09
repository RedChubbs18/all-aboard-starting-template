import { NextResponse } from "next/server";
import { z } from "zod";
import { DEMO_COOKIE, authMode, demoCookieOptions, signDemoSession } from "@/lib/auth/server";
import { csrfCheck } from "@/lib/auth/csrf";
import { demoGate } from "@/lib/auth/demo-gate";
import { prisma } from "@/server/db";

const bodySchema = z.object({ userId: z.string().min(1), pin: z.string().max(100).optional() });

/** Demo persona sign-in. Loopback only, unless DEMO_PIN is set and the request carries it (see demo-gate). */
export async function POST(req: Request) {
  if (authMode() !== "demo") return new Response("Not found", { status: 404 });
  const csrf = csrfCheck(req);
  if (csrf) return csrf;
  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const denied = demoGate(req, { requirePin: true, pin: body.data.pin ?? null });
  if (denied) return denied;
  const user = await prisma.user.findUnique({ where: { id: body.data.userId } });
  if (!user) return Response.json({ error: "unknown_user" }, { status: 404 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(DEMO_COOKIE, await signDemoSession(user.id), demoCookieOptions());
  return res;
}
