import { withRole } from "@/lib/auth/server";
import { listAdapterModes } from "@/adapters/registry";
import { prisma } from "@/server/db";

/** Placeholder admin feed (admin only). WS4 builds on this. */
export const GET = withRole(["ADMIN"], async () => {
  const [templates, content, faqs, users, adapters] = await Promise.all([
    prisma.taskTemplate.count(), prisma.contentItem.count(), prisma.faq.count(), prisma.user.count(), listAdapterModes(),
  ]);
  return Response.json({ templates, content, faqs, users, adapters });
});
