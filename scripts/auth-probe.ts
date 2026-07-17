// scripts/auth-probe.ts
// Measures the internal Better Auth getSession() call breakdown
// specifically how many Prisma queries it runs and how long each takes

import { prisma } from "../src/server/lib/prisma";

const RUNS = 3;

async function main() {
  console.log("\n══════════════════════════════════════════════════");
  console.log("   BETTER-AUTH getSession() BREAKDOWN PROBE");
  console.log("══════════════════════════════════════════════════\n");

  // Simulate what Better Auth does inside getSession:
  // 1. Reads the session token from cookie (no DB, instant)
  // 2. Calls session.findFirst({ where: { token } }) — this is the first DB query
  // 3. Calls user.findUnique({ where: { id } }) — this is the second DB query
  // These are done SEQUENTIALLY inside Better Auth's findSession() handler

  // Find an active session to use for testing
  const sess = await prisma.session.findFirst({
    orderBy: { createdAt: "desc" },
  });

  if (!sess) {
    console.log("[auth-probe] No sessions in DB. Log in first, then re-run.");
    await prisma.$disconnect();
    return;
  }

  console.log(`[auth-probe] Testing with session token: ${sess.token.slice(0, 12)}...`);
  console.log(`[auth-probe] UserId: ${sess.userId}\n`);

  const sessionTimes: number[] = [];
  const userTimes: number[] = [];

  for (let i = 0; i < RUNS; i++) {
    // Query 1: Better Auth findSession (session.findFirst by token)
    const t1 = performance.now();
    await prisma.session.findFirst({
      where: { token: sess.token },
    });
    const tSession = performance.now() - t1;
    sessionTimes.push(tSession);

    // Query 2: Better Auth findUser (user.findUnique by id)
    const t2 = performance.now();
    await prisma.user.findUnique({
      where: { id: sess.userId },
    });
    const tUser = performance.now() - t2;
    userTimes.push(tUser);

    console.log(
      `  Run ${i + 1}: session.findFirst = ${tSession.toFixed(1)}ms | user.findUnique = ${tUser.toFixed(1)}ms | TOTAL = ${(tSession + tUser).toFixed(1)}ms`
    );
  }

  const avgSession = sessionTimes.reduce((a, b) => a + b, 0) / RUNS;
  const avgUser = userTimes.reduce((a, b) => a + b, 0) / RUNS;

  console.log(`\n[auth-probe] Average breakdown:`);
  console.log(`  session.findFirst()         = ${avgSession.toFixed(1)}ms`);
  console.log(`  user.findUnique()           = ${avgUser.toFixed(1)}ms`);
  console.log(`  Better Auth getSession TOTAL = ${(avgSession + avgUser).toFixed(1)}ms`);
  console.log(`\n[auth-probe] Note: These 2 queries are SEQUENTIAL inside Better Auth.`);
  console.log(`[auth-probe] Each DB roundtrip ≈ network RTT to Supabase Singapore.`);

  // Now measure: after getSession resolves, getCurrentUser does ANOTHER prisma.user.findUnique
  // This is a THIRD sequential DB query in the request chain
  const t3 = performance.now();
  await prisma.user.findUnique({
    where: { id: sess.userId },
    include: {
      staffProfile: true,
      school: { include: { branding: true } },
    },
  });
  const tCurrentUser = performance.now() - t3;
  console.log(`\n[auth-probe] getCurrentUser: prisma.user.findUnique(+school+branding)`);
  console.log(`  = ${tCurrentUser.toFixed(1)}ms`);
  console.log(`\n[auth-probe] GRAND TOTAL for auth chain (3 sequential queries):`);
  console.log(`  = ${(avgSession + avgUser + tCurrentUser).toFixed(1)}ms`);
  console.log(`\n[auth-probe] This is why getSession logs ~400ms and getCurrentUser logs ~1000ms.`);
  console.log(`  Each of the 3 DB queries takes ~${((avgSession + avgUser + tCurrentUser) / 3).toFixed(0)}ms avg due to India→Singapore RTT.`);

  await prisma.$disconnect();
  console.log("\n══════════════════════════════════════════════════\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
