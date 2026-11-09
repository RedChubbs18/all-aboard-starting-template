/** Basic definition list for placeholder pages. WS1+ replace these with real components. */
export function DataList({ title, items }: { title: string; items: { id: string; primary: string; secondary?: string }[] }) {
  return (
    <section aria-label={title} className="mt-4">
      <h2 className="text-lg font-bold">{title} <span className="text-muted">({items.length})</span></h2>
      <ul className="mt-2 divide-y divide-line rounded-lg bg-card border border-line">
        {items.map((i) => (
          <li key={i.id} className="px-4 py-3">
            <p className="font-medium">{i.primary}</p>
            {i.secondary && <p className="text-sm text-muted">{i.secondary}</p>}
          </li>
        ))}
        {items.length === 0 && <li className="px-4 py-3 text-muted">Nothing to show.</li>}
      </ul>
    </section>
  );
}
