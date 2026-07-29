/**
 * Create two accounts that SHARE one workspace, on a fresh starter site (not the
 * Acme demo) — so you can open the same page in two browsers and watch the
 * editing lock: whoever arrives first edits, the other gets a live read-only view.
 *
 * Run:  npx tsx scripts/make-lock-demo.ts
 * Re-runnable — it clears the previous pair first.
 */
import { loadEnv } from "../src/lib/env";
loadEnv();

import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth";
import { createStarterSite } from "../src/lib/onboarding";

const prisma = new PrismaClient();

const OWNER = "owner@demo.site";
const EDITOR = "editor@demo.site";
const PASSWORD = "builder123";

async function main() {
  // Clean any previous run: deleting the users clears their memberships/sessions,
  // and deleting the org clears its site, pages and components.
  await prisma.user.deleteMany({ where: { email: { in: [OWNER, EDITOR] } } });
  await prisma.organization.deleteMany({ where: { name: "Demo Workspace" } });

  const hash = await hashPassword(PASSWORD);
  const org = await prisma.organization.create({ data: { name: "Demo Workspace" } });
  const owner = await prisma.user.create({
    data: { email: OWNER, name: "Site Owner", passwordHash: hash },
  });
  const editor = await prisma.user.create({
    data: { email: EDITOR, name: "Teammate", passwordHash: hash },
  });
  await prisma.membership.create({ data: { orgId: org.id, userId: owner.id, role: "owner" } });
  await prisma.membership.create({ data: { orgId: org.id, userId: editor.id, role: "editor" } });

  const site = await createStarterSite(org.id, "Demo Workspace", owner.id);

  console.log(`
  ✓ Two accounts in ONE shared workspace (they edit the SAME site):

      ${OWNER}    password: ${PASSWORD}   (owner)
      ${EDITOR}   password: ${PASSWORD}   (editor)

  To see the editing lock:
    1. Sign in as ${OWNER} in one browser, open the editor.
    2. Sign in as ${EDITOR} in a second browser (or a private window),
       open the SAME page — you'll get a read-only view that updates itself.

  Their fresh starter site:  /s/${site.slug}
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
