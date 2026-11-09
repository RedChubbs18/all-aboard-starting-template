import { NextResponse } from "next/server";
import { z } from "zod";
import { DEMO_COOKIE, authMode, demoCookieOptions, signDemoSession } from "@/lib/auth/server";
import { prisma } from "@/server/db";

export async function POST(req: Request) {
  if (authMode() !== "demo") return new Response("Not found", { status: 404 });
  const body = z.object({ userId: z.string().min(1) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const user = await prisma.user.findUnique({ where: { id: body.data.userId } });
  if (!user) return Response.json({ error: "unknown_user" }, { status: 404 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(DEMO_COOKIE, await signDemoSession(user.id), demoCookieOptions());
  return res;
}
