"use client";
import { TeamsManager } from "@/components/admin/TeamsManager";

export default function Page() {
  return (
    <>
      <h2 className="mb-3 text-xl font-semibold">Teams and people</h2>
      <TeamsManager />
    </>
  );
}
