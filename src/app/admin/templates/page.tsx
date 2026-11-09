"use client";
import { TemplatesManager } from "@/components/admin/TemplatesManager";

export default function Page() {
  return (
    <>
      <h2 className="mb-3 text-xl font-bold">Task templates</h2>
      <TemplatesManager />
    </>
  );
}
