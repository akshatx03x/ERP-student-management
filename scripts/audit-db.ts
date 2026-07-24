import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient({
  log: [],
});

interface DBMetrics {
  connectionTimeMs: number;
  simpleQueryMs: number;
  complexQueryMs: number;
  serializationMs: number;
  prismaOverheadEstimateMs: number;
  supabaseLatencyMs: number;
  isPooledUrl: boolean;
}

async function runDBAudit(): Promise<DBMetrics> {
  console.log("\n--- STARTING DATABASE & SUPABASE AUDIT ---");
  const dbUrl = process.env.DATABASE_URL || "";
  const directUrl = process.env.DIRECT_URL || "";
  const isPooledUrl = dbUrl.includes("pooler") || dbUrl.includes(":6543") || dbUrl.includes("pgbouncer");

  console.log(`Database URL Type: ${isPooledUrl ? "Pooled (pgBouncer / Supabase pooler)" : "Direct Connection"}`);
  console.log(`DATABASE_URL configured: ${dbUrl ? "YES" : "NO"}`);
  console.log(`DIRECT_URL configured: ${directUrl ? "YES" : "NO"}`);

  // 1. Connection Time
  const connStart = performance.now();
  await prisma.$connect();
  const connectionTimeMs = Math.round(performance.now() - connStart);
  console.log(`Prisma $connect() Time: ${connectionTimeMs}ms`);

  // 2. Simple Query (SELECT 1 via raw)
  const simpleStart = performance.now();
  await prisma.$queryRaw`SELECT 1 as ping`;
  const simpleQueryMs = Math.round(performance.now() - simpleStart);
  console.log(`Simple Query (SELECT 1) Supabase Roundtrip: ${simpleQueryMs}ms`);

  // 3. Complex Query & Serialization
  const complexStart = performance.now();
  const students = await prisma.student.findMany({
    take: 100,
    include: {
      user: true,
      enrollments: { include: { class: true, section: true } },
    },
  });
  const complexQueryMs = Math.round(performance.now() - complexStart);

  const serialStart = performance.now();
  const jsonStr = JSON.stringify(students);
  const serializationMs = Math.round(performance.now() - serialStart);
  const payloadKb = (jsonStr.length / 1024).toFixed(2);

  console.log(`Complex Query (100 Students + User + Enrollments): ${complexQueryMs}ms`);
  console.log(`JS Object Serialization (Payload ${payloadKb} KB): ${serializationMs}ms`);

  // 4. Prisma Engine Overhead Estimate
  // Estimate engine serialization overhead by comparing raw vs client query
  const rawStart = performance.now();
  await prisma.$queryRaw`SELECT id, email, role FROM "User" LIMIT 50`;
  const rawMs = performance.now() - rawStart;

  const clientStart = performance.now();
  await prisma.user.findMany({ take: 50, select: { id: true, email: true, role: true } });
  const clientMs = performance.now() - clientStart;

  const prismaOverheadEstimateMs = Math.max(0, Math.round(clientMs - rawMs));
  console.log(`Prisma Client Engine Overhead Estimate: ${prismaOverheadEstimateMs}ms (Raw: ${Math.round(rawMs)}ms vs Model Client: ${Math.round(clientMs)}ms)`);

  const metrics: DBMetrics = {
    connectionTimeMs,
    simpleQueryMs,
    complexQueryMs,
    serializationMs,
    prismaOverheadEstimateMs,
    supabaseLatencyMs: simpleQueryMs,
    isPooledUrl,
  };

  await prisma.$disconnect();
  return metrics;
}

if (require.main === module) {
  runDBAudit().catch((err) => {
    console.error("DB Audit failed:", err);
    process.exit(1);
  });
}

export { runDBAudit };
