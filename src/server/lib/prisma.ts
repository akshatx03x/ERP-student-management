import { PrismaClient } from "@prisma/client";

export interface QueryLogEntry {
  model: string;
  operation: string;
  durationMs: number;
  params: string;
  timestamp: number;
  payloadRows?: number;
  payloadSizeBytes?: number;
  hasSelect?: boolean;
}

const queryLogs: QueryLogEntry[] = [];
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaInstance: PrismaClient | undefined;
  extendedInstance: PrismaClient | undefined;
};

function analyzeAnomalies(log: QueryLogEntry, recentLogs: QueryLogEntry[]) {
  const anomalies: string[] = [];

  // 1. SELECT * Check
  if (!log.hasSelect && log.operation.startsWith("find")) {
    anomalies.push(`[ANOMALY: Select *] Query on '${log.model}.${log.operation}' does not use explicit 'select', fetching full table columns.`);
  }

  // 2. Large Payload Check
  if (log.payloadRows && log.payloadRows > 100) {
    anomalies.push(`[ANOMALY: Large Payload] '${log.model}.${log.operation}' returned ${log.payloadRows} rows (${(log.payloadSizeBytes! / 1024).toFixed(1)} KB).`);
  }

  // 3. Repeated Query Check
  const duplicates = recentLogs.filter(
    (l) => l.model === log.model && l.operation === log.operation && l.params === log.params
  );
  if (duplicates.length > 0) {
    anomalies.push(`[ANOMALY: Repeated Query] Identical query on '${log.model}.${log.operation}' executed ${duplicates.length + 1} times in request lifecycle.`);
  }

  // 4. N+1 Query Detection
  const sameModelQueries = recentLogs.filter((l) => l.model === log.model && l.timestamp > log.timestamp - 1000);
  if (sameModelQueries.length >= 3) {
    anomalies.push(`[ANOMALY: N+1 Query Detected] ${sameModelQueries.length + 1} rapid sequential queries executed on model '${log.model}'. Consider batching or using include/in.`);
  }

  // 5. Sequential Query Detection
  if (recentLogs.length > 0) {
    const prev = recentLogs[recentLogs.length - 1];
    if (log.timestamp - prev.timestamp < 15 && prev.model !== log.model) {
      anomalies.push(`[ANOMALY: Sequential Query] Query '${log.model}.${log.operation}' executed sequentially after '${prev.model}.${prev.operation}'. Check if Promise.all() can parallelize.`);
    }
  }

  return anomalies;
}

import { getDatabaseUrl } from "../providers/database.provider";

// Global container is defined above

// Function to create a base PrismaClient
function createBaseClient(): PrismaClient {
  return new PrismaClient({
    datasources: {
      db: {
        url: getDatabaseUrl(),
      },
    },
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

// Function to extend the base client with query logging/anomalies
function extendClient(client: PrismaClient): PrismaClient {
  return client.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const start = performance.now();
          const timestamp = Date.now();
          const result = await query(args);
          const durationMs = Math.round(performance.now() - start);

          let payloadRows = 0;
          let payloadSizeBytes = 0;
          if (Array.isArray(result)) {
            payloadRows = result.length;
            try {
              payloadSizeBytes = JSON.stringify(result).length;
            } catch {}
          } else if (result && typeof result === "object") {
            payloadRows = 1;
            try {
              payloadSizeBytes = JSON.stringify(result).length;
            } catch {}
          }

          const hasSelect = Boolean((args as any)?.select);
          let params = "";
          try {
            params = JSON.stringify(args ?? {}, (_, v) => (typeof v === "bigint" ? v.toString() : v));
          } catch {
            params = "[Unserializable]";
          }

          try {
            const logEntry: QueryLogEntry = {
              model: model ?? "UnknownModel",
              operation,
              durationMs,
              params,
              timestamp,
              payloadRows,
              payloadSizeBytes,
              hasSelect,
            };

            const recent = queryLogs.slice(-10);
            const anomalies = analyzeAnomalies(logEntry, recent);
            queryLogs.push(logEntry);

            console.log(`[PRISMA QUERY] Model: ${model || "Raw"} | Op: ${operation} | Duration: ${durationMs}ms | Rows: ${payloadRows}`);
            if (anomalies.length > 0) {
              anomalies.forEach((a) => console.warn(`  ⚠️  ${a}`));
            }
          } catch (logErr) {
            console.warn("Failed to log Prisma query metrics:", logErr);
          }

          return result;
        },
      },
    },
  }) as unknown as PrismaClient;
}

// Initialize active instance on load
if (!globalForPrisma.prismaInstance) {
  globalForPrisma.prismaInstance = createBaseClient();
  globalForPrisma.extendedInstance = extendClient(globalForPrisma.prismaInstance);
}

let isPragmaApplied = false;

export async function ensureSqlitePragmas(client: PrismaClient = globalForPrisma.prismaInstance!): Promise<void> {
  try {
    await client.$executeRawUnsafe(`PRAGMA foreign_keys = ON;`);
    await client.$executeRawUnsafe(`PRAGMA journal_mode = WAL;`);
    await client.$executeRawUnsafe(`PRAGMA synchronous = NORMAL;`);
    await client.$executeRawUnsafe(`PRAGMA busy_timeout = 5000;`);
    isPragmaApplied = true;
    console.log("[Prisma] SQLite production PRAGMA settings applied successfully (foreign_keys=ON, WAL, synchronous=NORMAL, busy_timeout=5000).");
  } catch (err) {
    console.warn("[Prisma] Failed to apply SQLite PRAGMAs:", err);
  }
}

// Recreate connections cleanly
export async function recreatePrismaInstance(): Promise<void> {
  console.log("[Prisma] Recreating Prisma instances and destroying cached connections...");
  if (globalForPrisma.prismaInstance) {
    try {
      await globalForPrisma.prismaInstance.$disconnect();
    } catch (e) {
      console.warn("[Prisma] Error disconnecting base instance:", e);
    }
  }

  isPragmaApplied = false;
  const newBase = createBaseClient();
  const newExtended = extendClient(newBase);

  globalForPrisma.prismaInstance = newBase;
  globalForPrisma.extendedInstance = newExtended;

  await newBase.$connect();
  await ensureSqlitePragmas(newBase);
  console.log("[Prisma] Reconnected to the database successfully.");
}

// Export the proxy
export const prisma = new Proxy({} as PrismaClient, {
  get(target, prop, receiver) {
    const activeInstance = globalForPrisma.extendedInstance || globalForPrisma.prismaInstance;
    if (!activeInstance) {
      throw new Error("[Prisma] No active database client instance available.");
    }
    const val = Reflect.get(activeInstance, prop, receiver);
    if (typeof val === "function") {
      return val.bind(activeInstance);
    }
    return val;
  },
});

export function getQueryLogs(): QueryLogEntry[] {
  return [...queryLogs];
}

export function clearQueryLogs(): void {
  queryLogs.length = 0;
}


