import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import { prisma } from "@/server/db";
import { EmptyState } from "@/components/ui/EmptyState";
import { CONTENT_GROUPS } from "./labels";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Guides, policies and benefits" };

/** FR-2.1: policy and benefit cards (plus device, workspace and guide content). Admin-managed. */
export default async function ContentIndex() {
  const items = await prisma.contentItem.findMany({ orderBy: { title: "asc" } });
  if (items.length === 0) return <EmptyState title="Nothing here yet">Guides and policies will appear here once they are published.</EmptyState>;
  return (
    <div className="mx-auto max-w-[720px] space-y-6">
      <h1 className="text-[28px] font-bold leading-tight text-ink">Guides, policies and benefits</h1>
      {CONTENT_GROUPS.map((g) => {
        const list = items.filter((i) => g.types.includes(i.type));
        if (list.length === 0) return null;
        const id = `g-${g.title.replace(/\W+/g, "-").toLowerCase()}`;
        return (
          <section key={g.title} aria-labelledby={id}>
            <h2 id={id} className="text-lg font-bold">
              {g.title}
            </h2>
            <ul className="mt-2 grid gap-3 sm:grid-cols-2">
              {list.map((i) => (
                <li key={i.slug}>
                  <Link
                    href={`/content/${i.slug}`}
                    className="flex min-h-14 h-full items-center gap-2 rounded-md border border-line bg-card p-4 hover:bg-brand-tint"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{i.title}</span>
                      {i.summary && <span className="mt-0.5 block text-sm text-muted">{i.summary}</span>}
                    </span>
                    <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
