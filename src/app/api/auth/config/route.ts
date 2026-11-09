import { authMode } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ mode: authMode() });
}
