export const metadata = { title: "Offline" };

export default function Offline() {
  return (
    <section className="rounded-lg bg-card p-6 border border-line">
      <h1 className="text-[28px] font-bold leading-tight text-ink">You are offline</h1>
      <p className="mt-2 text-muted">Pages you have already opened are still available. Reconnect to see live progress.</p>
    </section>
  );
}
