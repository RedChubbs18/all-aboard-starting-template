import { authMode } from "@/lib/auth/server";
import { demoPinRequired } from "@/lib/auth/demo-gate";

export const dynamic = "force-dynamic";

/** `demoPinRequired`: the persona switcher must send DEMO_PIN from this device (non-loopback host). */
export function GET(req: Request) {
  const mode = authMode();
  return Response.json({ mode, demoPinRequired: mode === "demo" && demoPinRequired(req) });
}
