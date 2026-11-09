import { NextResponse } from "next/server";
import { DEMO_COOKIE, authMode } from "@/lib/auth/server";
import { csrfCheck } from "@/lib/auth/csrf";
import { demoGate } from "@/lib/auth/demo-gate";

export async function POST(req: Request) {
  if (authMode() !== "demo") return new Response("Not found", { status: 404 });
  const denied = csrfCheck(req) ?? demoGate(req);
  if (denied) return denied;
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(DEMO_COOKIE);
  return res;
}
