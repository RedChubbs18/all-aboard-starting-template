"use client";

import { ToastProvider } from "@/components/ui/Toast";

/** Toasts for every starter-area page (journey, task, team, goals). */
export default function StarterLayout({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
