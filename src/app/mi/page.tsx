"use client";
import { PlaceholderPage } from "@/components/shell/PlaceholderPage";

type Data = { total: number; byStage: Record<string, number>; flagged: { id: string; reason: string | null }[]; exited: { id: string; stage: string | null; reason: string | null }[] };

export default function Page() {
  return (
    <PlaceholderPage<Data>
      title="MI"
      roles={["PNP", "ADMIN"]}
      path="/api/mi/journeys"
      listTitle="Starters by stage"
      toItems={(d) => Object.entries(d.byStage).map(([stage, n]) => ({ id: stage, primary: stage, secondary: `${n} of ${d.total}` }))}
    />
  );
}
