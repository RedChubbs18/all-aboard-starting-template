"use client";
import { PlaceholderPage } from "@/components/shell/PlaceholderPage";

type Data = { faqs: { id: string; question: string; answer: string }[] };

export default function Page() {
  return (
    <PlaceholderPage<Data>
      title="Help and FAQs"
      roles={["STARTER", "BUDDY", "LM", "PNP", "ADMIN"]}
      path="/api/faqs"
      listTitle="FAQs"
      toItems={(d) => d.faqs.map((f) => ({ id: f.id, primary: f.question, secondary: f.answer }))}
    />
  );
}
