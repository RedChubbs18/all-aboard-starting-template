"use client";
import { PlaceholderPage } from "@/components/shell/PlaceholderPage";

type Data = { journeys: { id: string; starter: string | null; stage: string; percent: number; overdue: number; blocked: number }[] };

export default function Page() {
  return (
    <PlaceholderPage<Data>
      title="My starters"
      roles={["LM", "PNP", "ADMIN"]}
      path="/api/journeys"
      listTitle="Starters"
      toItems={(d) => d.journeys.map((j) => ({ id: j.id, primary: `${j.starter} · ${j.stage}`, secondary: `${j.percent}% done · ${j.overdue} overdue · ${j.blocked} blocked` }))}
    />
  );
}
