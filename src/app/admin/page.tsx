"use client";
import { PlaceholderPage } from "@/components/shell/PlaceholderPage";

type Data = { templates: number; content: number; faqs: number; users: number; adapters: { key: string; mode: string }[] };

export default function Page() {
  return (
    <PlaceholderPage<Data>
      title="Admin"
      roles={["ADMIN"]}
      path="/api/admin/overview"
      listTitle="Adapters"
      toItems={(d) => d.adapters.map((a) => ({ id: a.key, primary: a.key, secondary: a.mode }))}
    />
  );
}
