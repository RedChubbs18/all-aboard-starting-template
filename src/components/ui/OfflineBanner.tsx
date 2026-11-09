"use client";

import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

/** PWA: shown while the browser reports it is offline. */
export function OfflineBanner() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  if (online) return null;
  return (
    <div role="status" className="flex items-center gap-2 rounded-md bg-warning-soft p-3 text-warning">
      <WifiOff aria-hidden className="size-5 shrink-0" />
      You&apos;re offline. Showing saved content.
    </div>
  );
}
