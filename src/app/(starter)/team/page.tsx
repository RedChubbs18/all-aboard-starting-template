"use client";
import { PlaceholderPage } from "@/components/shell/PlaceholderPage";

type Data = { team: { name: string } | null; members: { id: string; displayName: string; teamRole: string | null; jobTitle: string | null; bio: string | null }[] };

export default function Page() {
  return (
    <PlaceholderPage<Data>
      title="My team"
      roles={["STARTER", "BUDDY", "LM", "PNP", "ADMIN"]}
      path="/api/team"
      listTitle="Team members"
      toItems={(d) => d.members.map((m) => ({ id: m.id, primary: m.displayName, secondary: [m.teamRole, m.jobTitle, m.bio ?? "No bio yet"].filter(Boolean).join(" · ") }))}
    />
  );
}
