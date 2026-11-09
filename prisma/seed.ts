import "./load-env";
import { prisma } from "../src/server/db";
import { seedDatabase } from "../src/server/seed";

seedDatabase(prisma, (m) => console.log(`  ${m}`))
  .then((r) => console.log("Seeded:", r))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
