import { withRole } from "@/lib/auth/server";
import { prisma } from "@/server/db";

export const GET = withRole(["STARTER", "BUDDY", "LM", "PNP", "ADMIN"], async () => {
  const faqs = await prisma.faq.findMany({ orderBy: { id: "asc" } });
  return Response.json({ faqs });
});
