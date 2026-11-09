import { withRole } from "@/lib/auth/server";
import { getAdapter } from "@/adapters/registry";

/** The caller's own notifications, newest first. Never returns anyone else's. */
export const GET = withRole(["STARTER", "BUDDY", "LM", "PNP", "ADMIN"], async (_req, _ctx, user) => {
  let items;
  try {
    items = await (await getAdapter("notification")).list({ toUserId: user.id });
  } catch (e) {
    if (e instanceof Error && e.name === "AdapterNotConfiguredError") return Response.json({ notifications: [], unread: 0 });
    throw e;
  }
  const notifications = items
    .slice()
    .reverse()
    .slice(0, 50)
    .map((n) => ({ id: n.id, type: n.kind, title: n.subject, body: n.body, link: n.link ?? null, read: n.read, createdAt: n.sentAt }));
  return Response.json({ notifications, unread: items.filter((n) => !n.read).length });
});
