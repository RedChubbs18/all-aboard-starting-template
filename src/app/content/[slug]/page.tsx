import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AnchorDaysValue } from "@/components/journey/AnchorDaysValue";
import { Markdown } from "@/components/ui/Markdown";
import { Badge } from "@/components/ui/Badge";
import { prisma } from "@/server/db";
import { CONTENT_TYPE_LABEL } from "../labels";

// Content is admin-managed and changes at runtime, so never prerender it at build time.
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const c = await prisma.contentItem.findUnique({ where: { slug }, select: { title: true } });
  return { title: c?.title ?? "Content" };
}

/**
 * FR-1.5 / FR-1.6 / FR-2.1: one content page. Rendered on the server so it can be cached by the service worker
 * for offline use. Markdown is parsed into React nodes (no raw HTML). Content is non-personal; the one personal
 * value, {{anchorDays}}, is filled in the browser from the signed-in user's journey.
 */
export default async function ContentPage({ params }: Params) {
  const { slug } = await params;
  const c = await prisma.contentItem.findUnique({ where: { slug } });
  if (!c) notFound();
  return (
    <article className="mx-auto max-w-[720px] space-y-3">
      <Link href="/content" className="inline-flex min-h-11 items-center text-brand-strong underline underline-offset-2">
        All guides and policies
      </Link>
      <header>
        <Badge>{CONTENT_TYPE_LABEL[c.type] ?? "Guide"}</Badge>
        <h1 className="mt-2 text-[28px] font-bold leading-tight text-ink">{c.title}</h1>
        {c.summary && <p className="mt-1 text-muted">{c.summary}</p>}
      </header>
      <div className="rounded-lg bg-card p-4 border border-line">
        <Markdown source={c.body} vars={{ anchorDays: <AnchorDaysValue /> }} />
      </div>
      <p className="text-sm text-muted">Example content for a demo. It isn&apos;t real company policy.</p>
    </article>
  );
}
