"use client";

import { useMemo, useState } from "react";
import { useApi } from "@/lib/auth/use-api";
import { CONTENT_TYPES, STAGES } from "@/domain/types";
import { renderMarkdownSafe } from "@/server/admin-validation";
import { Chip } from "@/components/ui/Chip";
import { Alert, Confirm, Drawer, Field, btnCls, csv, inputCls, useNotice, useSend, type Fields } from "./common";

interface Content {
  id: string;
  slug: string;
  type: string;
  title: string;
  summary: string;
  body: string;
  stage: string | null;
  tags: string[];
}
interface Faq {
  id: string;
  question: string;
  answer: string;
  tags: string[];
  sourceSlug: string | null;
}

const blankContent = (): Content => ({ id: "", slug: "", type: "GUIDE", title: "", summary: "", body: "", stage: null, tags: [] });
const blankFaq = (): Faq => ({ id: "", question: "", answer: "", tags: [], sourceSlug: null });

/** Escaped Markdown preview: the renderer escapes all raw HTML, so the output is safe to inject. */
function Preview({ md }: { md: string }) {
  const html = useMemo(() => renderMarkdownSafe(md), [md]);
  return (
    <div
      aria-label="Preview"
      className="space-y-2 rounded-md border border-line bg-page p-3 [&_a]:text-brand-strong [&_a]:underline [&_h3]:text-lg [&_h3]:font-semibold [&_h4]:font-semibold [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6"
      dangerouslySetInnerHTML={{ __html: html || "<p>Nothing to preview yet.</p>" }}
    />
  );
}

/** FR-AD.2 */
export function ContentManager() {
  const content = useApi<Content[]>("/api/admin/content");
  const faqs = useApi<Faq[]>("/api/admin/faqs");
  const send = useSend();
  const n = useNotice();
  const [tab, setTab] = useState<"content" | "faqs">("content");
  const [c, setC] = useState<Content | null>(null);
  const [f, setF] = useState<Faq | null>(null);
  const [tags, setTags] = useState("");
  const [errors, setErrors] = useState<Fields>({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<{ kind: "content" | "faq"; id: string; label: string } | null>(null);

  const openC = (x: Content) => { setC(x); setTags(x.tags.join(", ")); setErrors({}); setMsg(""); };
  const openF = (x: Faq) => { setF(x); setTags(x.tags.join(", ")); setErrors({}); setMsg(""); };

  async function submit(kind: "content" | "faq", e: React.FormEvent) {
    e.preventDefault();
    const base = kind === "content" ? "/api/admin/content" : "/api/admin/faqs";
    const item = kind === "content" ? c! : f!;
    const { id, ...rest } = item;
    setBusy(true);
    const r = await send(id ? "PUT" : "POST", id ? `${base}/${id}` : base, { ...rest, tags: csv(tags) });
    setBusy(false);
    if (r.ok) {
      n.success(kind === "content" ? "Content saved. The chatbot will use it straight away." : "FAQ saved. The chatbot will use it straight away.");
      setC(null);
      setF(null);
      (kind === "content" ? content : faqs).reload();
    } else {
      setErrors(r.fields);
      setMsg(r.message);
    }
  }

  async function remove() {
    if (!del) return;
    setBusy(true);
    const r = await send("DELETE", `/api/admin/${del.kind === "content" ? "content" : "faqs"}/${del.id}`);
    setBusy(false);
    if (r.ok) {
      n.success(`Deleted "${del.label}".`);
      (del.kind === "content" ? content : faqs).reload();
    } else n.fail(r.message);
    setDel(null);
  }

  const tabBtn = (id: "content" | "faqs", label: string) => (
    <Chip role="tab" id={`tab-${id}`} selected={tab === id} aria-controls={`panel-${id}`} onClick={() => setTab(id)}>
      {label}
    </Chip>
  );

  return (
    <div className="space-y-4">
      <Alert kind="info">The chatbot answers only from this content and these FAQs. If something is not here, the chatbot will say it does not know.</Alert>
      {n.notice}
      <div role="tablist" aria-label="Content type" className="flex gap-2 overflow-x-auto pb-1">
        {tabBtn("content", `Content items (${content.data?.length ?? 0})`)}
        {tabBtn("faqs", `FAQs (${faqs.data?.length ?? 0})`)}
      </div>

      {tab === "content" && (
        <section role="tabpanel" id="panel-content" aria-labelledby="tab-content" className="space-y-3">
          {content.error && <Alert kind="danger">{content.error}</Alert>}
          <button type="button" className={btnCls.primary} onClick={() => openC(blankContent())}>New content item</button>
          <ul className="divide-y divide-line rounded-lg bg-card px-4 border border-line">
            {(content.data ?? []).map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="font-medium">{x.title}</p>
                  <p className="text-sm text-muted">{x.type} | {x.slug}{x.stage ? ` | ${x.stage}` : ""}</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" className={btnCls.secondary} onClick={() => openC(x)} aria-label={`Edit ${x.title}`}>Edit</button>
                  <button type="button" className={btnCls.secondary} onClick={() => setDel({ kind: "content", id: x.id, label: x.title })} aria-label={`Delete ${x.title}`}>Delete</button>
                </div>
              </li>
            ))}
            {content.loading && <li className="py-3 text-muted">Loading…</li>}
          </ul>
        </section>
      )}

      {tab === "faqs" && (
        <section role="tabpanel" id="panel-faqs" aria-labelledby="tab-faqs" className="space-y-3">
          {faqs.error && <Alert kind="danger">{faqs.error}</Alert>}
          <button type="button" className={btnCls.primary} onClick={() => openF(blankFaq())}>New FAQ</button>
          <ul className="divide-y divide-line rounded-lg bg-card px-4 border border-line">
            {(faqs.data ?? []).map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{x.question}</p>
                  <p className="text-sm text-muted">{x.sourceSlug ? `Source: ${x.sourceSlug}` : "No source content"}{x.tags.length ? ` | ${x.tags.join(", ")}` : ""}</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" className={btnCls.secondary} onClick={() => openF(x)} aria-label={`Edit FAQ ${x.question}`}>Edit</button>
                  <button type="button" className={btnCls.secondary} onClick={() => setDel({ kind: "faq", id: x.id, label: x.question })} aria-label={`Delete FAQ ${x.question}`}>Delete</button>
                </div>
              </li>
            ))}
            {faqs.loading && <li className="py-3 text-muted">Loading…</li>}
          </ul>
        </section>
      )}

      <Drawer title={c?.id ? "Edit content" : "New content"} open={!!c} onClose={() => setC(null)}>
        {c && (
          <form onSubmit={(e) => submit("content", e)} className="space-y-3" noValidate>
            {msg && !Object.keys(errors).length && <Alert kind="danger">{msg}</Alert>}
            <Field label="Slug" error={errors.slug} hint="Lowercase letters, numbers and hyphens. Tasks and FAQs refer to this.">
              {(p) => <input {...p} className={inputCls} value={c.slug} onChange={(e) => setC({ ...c, slug: e.target.value })} />}
            </Field>
            <Field label="Title" error={errors.title}>
              {(p) => <input {...p} className={inputCls} value={c.title} onChange={(e) => setC({ ...c, title: e.target.value })} />}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type" error={errors.type}>
                {(p) => (
                  <select {...p} className={inputCls} value={c.type} onChange={(e) => setC({ ...c, type: e.target.value })}>
                    {CONTENT_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                )}
              </Field>
              <Field label="Stage" error={errors.stage}>
                {(p) => (
                  <select {...p} className={inputCls} value={c.stage ?? ""} onChange={(e) => setC({ ...c, stage: e.target.value || null })}>
                    <option value="">Any</option>
                    {STAGES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                )}
              </Field>
            </div>
            <Field label="Summary" error={errors.summary}>
              {(p) => <input {...p} className={inputCls} value={c.summary} onChange={(e) => setC({ ...c, summary: e.target.value })} />}
            </Field>
            <Field label="Tags (comma separated)" error={errors.tags}>
              {(p) => <input {...p} className={inputCls} value={tags} onChange={(e) => setTags(e.target.value)} />}
            </Field>
            <Field label="Body (Markdown)" error={errors.body} hint="Raw HTML is shown as plain text, never run.">
              {(p) => <textarea {...p} rows={10} className={`${inputCls} font-mono`} value={c.body} onChange={(e) => setC({ ...c, body: e.target.value })} />}
            </Field>
            <p className="font-medium">Preview</p>
            <Preview md={c.body} />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className={btnCls.secondary} onClick={() => setC(null)}>Cancel</button>
              <button type="submit" className={btnCls.primary} disabled={busy} aria-busy={busy}>Save content</button>
            </div>
          </form>
        )}
      </Drawer>

      <Drawer title={f?.id ? "Edit FAQ" : "New FAQ"} open={!!f} onClose={() => setF(null)}>
        {f && (
          <form onSubmit={(e) => submit("faq", e)} className="space-y-3" noValidate>
            {msg && !Object.keys(errors).length && <Alert kind="danger">{msg}</Alert>}
            <Field label="Question" error={errors.question}>
              {(p) => <input {...p} className={inputCls} value={f.question} onChange={(e) => setF({ ...f, question: e.target.value })} />}
            </Field>
            <Field label="Answer" error={errors.answer}>
              {(p) => <textarea {...p} rows={6} className={inputCls} value={f.answer} onChange={(e) => setF({ ...f, answer: e.target.value })} />}
            </Field>
            <Field label="Tags (comma separated)" error={errors.tags}>
              {(p) => <input {...p} className={inputCls} value={tags} onChange={(e) => setTags(e.target.value)} />}
            </Field>
            <Field label="Source content" error={errors.sourceSlug} hint="The content item this answer comes from.">
              {(p) => (
                <select {...p} className={inputCls} value={f.sourceSlug ?? ""} onChange={(e) => setF({ ...f, sourceSlug: e.target.value || null })}>
                  <option value="">None</option>
                  {(content.data ?? []).map((x) => <option key={x.slug} value={x.slug}>{x.title} ({x.slug})</option>)}
                </select>
              )}
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className={btnCls.secondary} onClick={() => setF(null)}>Cancel</button>
              <button type="submit" className={btnCls.primary} disabled={busy} aria-busy={busy}>Save FAQ</button>
            </div>
          </form>
        )}
      </Drawer>

      <Confirm open={!!del} title="Delete?" message={<>Delete &quot;{del?.label}&quot;? This cannot be undone.</>} confirmLabel="Delete" busy={busy} onCancel={() => setDel(null)} onConfirm={remove} />
    </div>
  );
}
