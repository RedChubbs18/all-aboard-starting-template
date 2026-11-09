"use client";
import { PlaceholderPage } from "@/components/shell/PlaceholderPage";

type Data = { journeys: { id: string; starter: string | null; stage: string; percent: number; remaining: number; flagged: boolean }[] };

// WS1 replaces this placeholder with the real journey experience.
export default function Page() {
  return (
    <PlaceholderPage<Data>
      title="My journey"
      roles={["STARTER", "BUDDY", "LM", "PNP", "ADMIN"]}
      path="/api/journeys"
      listTitle="Journeys you can see"
      toItems={(d) => d.journeys.map((j) => ({ id: j.id, primary: `${j.starter} · ${j.stage}`, secondary: `${j.percent}% done, ${j.remaining} to go${j.flagged ? " · flagged" : ""}` }))}
    />
  );
}
