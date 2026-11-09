export const metadata = { title: "Offline" };

export default function Offline() {
  return (
    <section className="rounded-lg bg-surface p-6 shadow-card">
      <h1 className="text-2xl font-semibold text-brand-strong">You are offline</h1>
      <p className="mt-2 text-text-muted">Pages you have already opened are still available. Reconnect to see live progress.</p>
    </section>
  );
}
