import { NextResponse } from "next/server";
import { DEMO_COOKIE, authMode } from "@/lib/auth/server";

export async function POST() {
  if (authMode() !== "demo") return new Response("Not found", { status: 404 });
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(DEMO_COOKIE);
  return res;
}
