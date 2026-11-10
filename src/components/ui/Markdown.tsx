import { ImageIcon } from "lucide-react";
import type { ReactNode } from "react";
import { isSameOriginImage, parseMarkdown, safeHref, type Block, type Inline } from "@/lib/markdown";

type Vars = Record<string, ReactNode>;

function Inlines({ nodes, vars }: { nodes: Inline[]; vars: Vars }) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.t) {
          case "text":
            return n.v;
          case "code":
            return (
              <code key={i} className="rounded-sm bg-page px-1 py-0.5 text-[0.9em]">
                {n.v}
              </code>
            );
          case "strong":
            return (
              <strong key={i}>
                <Inlines nodes={n.c} vars={vars} />
              </strong>
            );
          case "em":
            return (
              <em key={i}>
                <Inlines nodes={n.c} vars={vars} />
              </em>
            );
          case "var":
            return <span key={i}>{vars[n.name] ?? `{{${n.name}}}`}</span>;
          case "link": {
            const external = /^https?:/i.test(n.href);
            return (
              <a
                key={i}
                href={n.href}
                {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="break-words text-brand-strong underline underline-offset-2"
              >
                <Inlines nodes={n.c} vars={vars} />
                {external && <span className="sr-only"> (opens in a new tab)</span>}
              </a>
            );
          }
          case "image": {
            // Same-origin images (/media/, /brand/) render inline. Anything else stays a placeholder with a link, never auto-loading third-party URLs.
            if (isSameOriginImage(n.src)) {
              return (
                // eslint-disable-next-line @next/next/no-img-element -- bundled static SVG, no optimisation needed
                <img key={i} src={n.src.trim()} alt={n.alt || "illustration"} loading="lazy" className="my-3 block h-auto w-full max-w-2xl rounded-md border border-line bg-page" />
              );
            }
            const href = safeHref(n.src);
            return (
              <span key={i} className="my-2 flex items-center gap-2 rounded-md border border-dashed border-line bg-page p-3 text-muted">
                <ImageIcon aria-hidden className="size-6 shrink-0" />
                <span>
                  Image: {n.alt || "illustration"}
                  {href && (
                    <>
                      {" "}
                      <a href={href} target="_blank" rel="noopener noreferrer" className="text-brand-strong underline underline-offset-2">
                        Open image<span className="sr-only"> (opens in a new tab)</span>
                      </a>
                    </>
                  )}
                </span>
              </span>
            );
          }
        }
      })}
    </>
  );
}

function BlockView({ b, vars }: { b: Block; vars: Vars }) {
  switch (b.t) {
    case "heading": {
      const cls = {
        1: "mt-6 text-[1.75rem] font-bold leading-tight text-ink",
        2: "mt-6 text-xl font-bold text-ink",
        3: "mt-5 text-lg font-bold",
        4: "mt-4 text-base font-semibold",
      }[b.level];
      // Content titles are rendered as the page h1 by the caller, so body headings start at h2.
      const Tag = (`h${Math.min(6, b.level + 1)}`) as "h2" | "h3" | "h4" | "h5";
      return (
        <Tag className={cls}>
          <Inlines nodes={b.c} vars={vars} />
        </Tag>
      );
    }
    case "p":
      return (
        <p className="mt-3 leading-relaxed">
          <Inlines nodes={b.c} vars={vars} />
        </p>
      );
    case "ul":
      return (
        <ul className="mt-3 list-disc space-y-1 pl-6">
          {b.items.map((it, i) => (
            <li key={i}>
              <Inlines nodes={it} vars={vars} />
            </li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol className="mt-3 list-decimal space-y-1 pl-6">
          {b.items.map((it, i) => (
            <li key={i}>
              <Inlines nodes={it} vars={vars} />
            </li>
          ))}
        </ol>
      );
    case "quote":
      return (
        <blockquote className="mt-3 border-l-4 border-brand bg-brand-tint p-3">
          <Inlines nodes={b.c} vars={vars} />
        </blockquote>
      );
    case "hr":
      return <hr className="my-4 border-line" />;
    case "table":
      return (
        <div tabIndex={0} role="region" aria-label="Table (scrolls sideways)" className="focus-inset mt-3 overflow-x-auto">
          <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
            <thead>
              <tr>
                {b.head.map((c, i) => (
                  <th key={i} scope="col" className="border-b-2 border-line bg-page p-2 font-semibold">
                    <Inlines nodes={c} vars={vars} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) => (
                    <td key={ci} className="border-b border-line p-2 align-top">
                      <Inlines nodes={c} vars={vars} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

/**
 * Renders Markdown as React nodes (no dangerouslySetInnerHTML, so raw HTML in content shows as text).
 * `vars` fills `{{name}}` placeholders, e.g. `{ anchorDays: "Tuesday and Thursday" }` (FR-1.5).
 */
export function Markdown({ source, vars = {} }: { source: string; vars?: Vars }) {
  const blocks = parseMarkdown(source);
  return (
    <div className="text-base">
      {blocks.map((b, i) => (
        <BlockView key={i} b={b} vars={vars} />
      ))}
    </div>
  );
}
