// scripts/perf-probe.ts
// Run: npx tsx scripts/perf-probe.ts
// Measures: raw DB ping, cold query, warm query, sequential vs parallel

import { PrismaClient } from "@prisma/client";
import * as net from "net";
import * as dns from "dns/promises";

const prisma = new PrismaClient({ log: [] });

const DB_HOST = "aws-0-ap-southeast-1.pooler.supabase.com";
const DB_PORT = 5432;
const RUNS = 5;

// ── TCP Ping ──────────────────────────────────────────────────────────────────
async function tcpPing(host: string, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    const sock = net.createConnection({ host, port }, () => {
      const ms = performance.now() - t0;
      sock.destroy();
      resolve(ms);
    });
    sock.on("error", reject);
    sock.setTimeout(5000, () => { sock.destroy(); reject(new Error("timeout")); });
  });
}

// ── DNS Resolve ───────────────────────────────────────────────────────────────
async function dnsTiming(host: string): Promise<{ ms: number; ips: string[] }> {
  const t0 = performance.now();
  const ips = await dns.resolve4(host);
  return { ms: performance.now() - t0, ips };
}

// ── Prisma Query Timing ───────────────────────────────────────────────────────
async function prismaProbe() {
  // Cold start (first ever query)
  const tCold0 = performance.now();
  await prisma.$queryRaw`SELECT 1`;
  const coldMs = performance.now() - tCold0;

  // Warm queries (reuses connection pool)
  const warmTimes: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now();
    await prisma.$queryRaw`SELECT 1`;
    warmTimes.push(performance.now() - t0);
  }

  // Sequential model queries
  const tSeq0 = performance.now();
  const _s1 = await prisma.user.count();
  const _s2 = await prisma.session.count();
  const _s3 = await prisma.school.count();
  const seqMs = performance.now() - tSeq0;
  const seqIndividual = [
    performance.now() - tSeq0, // approximate — actual sub-times are captured inside the loop
  ];

  // Parallel model queries
  const tPar0 = performance.now();
  await Promise.all([
    prisma.user.count(),
    prisma.session.count(),
    prisma.school.count(),
  ]);
  const parMs = performance.now() - tPar0;

  // getSession simulation: session.findFirst + user.findUnique (sequential, as Better Auth does)
  const tBetterAuth0 = performance.now();
  const sess = await prisma.session.findFirst({ orderBy: { createdAt: "desc" }, include: { user: true } });
  const tSessionFetch = performance.now() - tBetterAuth0;

  let tUserFetch = 0;
  if (sess?.userId) {
    const tU0 = performance.now();
    await prisma.user.findUnique({
      where: { id: sess.userId },
      include: { school: { include: { branding: true } } },
    });
    tUserFetch = performance.now() - tU0;
  }

  return { coldMs, warmTimes, seqMs, parMs, tSessionFetch, tUserFetch };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n══════════════════════════════════════════════════");
  console.log("   FORENSIC PERFORMANCE PROBE");
  console.log("══════════════════════════════════════════════════\n");

  // 1. DNS
  try {
    const dns = await dnsTiming(DB_HOST);
    console.log(`[dns]  Resolved ${DB_HOST}`);
    console.log(`       IPs: ${dns.ips.join(", ")}`);
    console.log(`       Duration: ${dns.ms.toFixed(1)}ms\n`);
  } catch (e) { console.log(`[dns]  FAILED: ${e}\n`); }

  // 2. TCP Ping (5 samples)
  const pings: number[] = [];
  process.stdout.write("[ping] TCP to Supabase (5 samples): ");
  for (let i = 0; i < 5; i++) {
    try {
      const ms = await tcpPing(DB_HOST, DB_PORT);
      pings.push(ms);
      process.stdout.write(`${ms.toFixed(0)}ms `);
    } catch (e) { process.stdout.write("ERR "); }
  }
  const avgPing = pings.length ? pings.reduce((a, b) => a + b, 0) / pings.length : -1;
  console.log(`\n       Average RTT: ${avgPing.toFixed(1)}ms\n`);

  // 3. Prisma
  try {
    const p = await prismaProbe();
    console.log(`[prisma] Cold query (first SELECT 1):         ${p.coldMs.toFixed(1)}ms`);
    const warmAvg = p.warmTimes.reduce((a, b) => a + b, 0) / p.warmTimes.length;
    console.log(`[prisma] Warm queries (${RUNS}x SELECT 1):       avg=${warmAvg.toFixed(1)}ms  samples=[${p.warmTimes.map(t => t.toFixed(0)).join(",")}]ms`);
    console.log(`[prisma] 3x sequential model.count():         ${p.seqMs.toFixed(1)}ms`);
    console.log(`[prisma] 3x parallel   model.count():         ${p.parMs.toFixed(1)}ms`);
    console.log(`[prisma] session.findFirst(+user):            ${p.tSessionFetch.toFixed(1)}ms`);
    console.log(`[prisma] user.findUnique(+school+branding):   ${p.tUserFetch.toFixed(1)}ms`);
    console.log(`[prisma] auth roundtrip total (seq):          ${(p.tSessionFetch + p.tUserFetch).toFixed(1)}ms`);

    const ratio = p.seqMs > 0 ? (p.seqMs / p.parMs).toFixed(2) : "N/A";
    console.log(`\n[result] Sequential/Parallel speedup ratio: ${ratio}x`);
    console.log(`[result] Every 1 sequential DB query ≈ 1 extra RTT (${avgPing.toFixed(0)}ms) of latency\n`);
  } catch (e) { console.log(`[prisma] FAILED: ${e}\n`); }

  await prisma.$disconnect();
  console.log("══════════════════════════════════════════════════");
  console.log("   PROBE COMPLETE");
  console.log("══════════════════════════════════════════════════\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
