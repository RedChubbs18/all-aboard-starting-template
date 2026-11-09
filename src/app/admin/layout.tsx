"use client";

import { usePathname } from "next/navigation";
import { isPnpAdminPath } from "@/lib/auth/roles";
import { RoleGate } from "@/components/shell/RoleGate";
import { AdminTabs } from "@/components/admin/common";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <RoleGate roles={isPnpAdminPath(path) ? ["ADMIN", "PNP"] : ["ADMIN"]}>
      <div className="mx-auto max-w-[1200px]">
        <h1 className="text-2xl font-semibold text-brand-strong">Admin</h1>
        <div className="mt-3">
          <AdminTabs />
        </div>
        {children}
      </div>
    </RoleGate>
  );
}
