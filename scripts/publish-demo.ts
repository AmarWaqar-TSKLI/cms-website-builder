/**
 * Publish the seeded demo site and build it in-process, so /s/acme-store is
 * live straight after `npm run seed` — no app server or worker required.
 * Used to set up (and reset) the hosted demo:
 *
 *   npm run seed && npm run publish:demo      (or: npm run demo:reset)
 */
import { loadEnv } from "../src/lib/env";
loadEnv();

import { prisma } from "../src/lib/db";
import { publishSite } from "../src/lib/publish";
import { drainBuildJobs } from "../src/lib/jobs";

async function main() {
  const sites = await prisma.site.findMany({ select: { id: true, slug: true, orgId: true } });
  for (const site of sites) {
    const owner = await prisma.membership.findFirst({ where: { orgId: site.orgId }, select: { userId: true } });
    const result = await publishSite(site.id, owner?.userId ?? null, "Initial publish (demo setup)");
    console.log(`published /s/${site.slug} as v${result.versionNo} (job queued)`);
  }
  const ran = await drainBuildJobs((msg) => console.log(`  ${msg}`));
  console.log(`built ${ran} release(s)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
