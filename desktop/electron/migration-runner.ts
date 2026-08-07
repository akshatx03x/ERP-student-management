import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { app } from "electron";
import { PrismaClient } from "@prisma/client";

export interface MigrationResult {
  success: boolean;
  message: string;
}

function runCommand(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    const isWin = process.platform === "win32";
    const executable = isWin && !command.endsWith(".exe") && !command.endsWith(".cmd") ? `${command}.cmd` : command;

    console.log(`[MigrationRunner] Spawning: ${executable} ${args.join(" ")}`);
    const child = spawn(executable, args, {
      cwd,
      env,
      shell: !app.isPackaged,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Process exited with code ${code}.\n${stderr || stdout}`));
      }
    });

    child.on("error", (err) => {
      reject(err);
    });
  });
}

async function checkPendingMigrationsExist(
  executionCwd: string,
  schemaPath: string,
  prismaCliJs: string | null,
  env: NodeJS.ProcessEnv
): Promise<boolean> {
  try {
    let stdout = "";
    if (prismaCliJs) {
      const statusEnv = { ...env };
      if (app.isPackaged) {
        statusEnv.ELECTRON_RUN_AS_NODE = "1";
      }
      stdout = await runCommand(
        app.isPackaged ? process.execPath : "node.exe",
        [prismaCliJs, "migrate", "status", `--schema=${schemaPath}`],
        executionCwd,
        statusEnv
      );
    } else {
      stdout = await runCommand(
        "npx",
        ["prisma", "migrate", "status", `--schema=${schemaPath}`],
        executionCwd,
        env
      );
    }
    if (stdout.includes("Database schema is up to date") || stdout.includes("No pending migrations")) {
      return false;
    }
    return true;
  } catch (err: any) {
    const errText = err.message || "";
    if (errText.includes("Database schema is up to date") || errText.includes("No pending migrations")) {
      return false;
    }
    // Non-zero status indicates pending migrations or unapplied schema changes
    return true;
  }
}

async function createPreMigrationBackup(databaseUrl: string, backupsDir: string): Promise<boolean> {
  try {
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFilename = `pre_migration_backup_${timestamp}.db`;
    const backupPath = path.join(backupsDir, backupFilename);
    const normalizedBackupPath = backupPath.replace(/\\/g, "/");

    console.log(`[MigrationRunner] Pending schema updates found. Creating pre-migration backup snapshot at: ${backupPath}`);

    const prisma = new PrismaClient({
      datasources: { db: { url: databaseUrl } },
      log: [],
    });

    try {
      await prisma.$connect();
      await prisma.$executeRawUnsafe(`PRAGMA journal_mode = WAL;`);
      await prisma.$executeRawUnsafe(`VACUUM INTO '${normalizedBackupPath}';`);
      await prisma.$disconnect();
    } catch (err: any) {
      console.warn(`[MigrationRunner] VACUUM INTO statement warning: ${err.message}. Performing direct copy fallback...`);
      try { await prisma.$disconnect(); } catch { }

      const cleanDbPath = databaseUrl.replace(/^file:/, "");
      if (fs.existsSync(cleanDbPath)) {
        fs.copyFileSync(cleanDbPath, backupPath);
      }
    }

    if (fs.existsSync(backupPath) && fs.statSync(backupPath).size > 0) {
      console.log(`[MigrationRunner] Pre-migration backup verified successfully (${fs.statSync(backupPath).size} bytes).`);
      return true;
    }
    return false;
  } catch (backupErr: any) {
    console.error(`[MigrationRunner] Pre-migration backup failed:`, backupErr);
    return false;
  }
}

export async function runPendingPrismaMigrations(
  cwd: string,
  databaseUrl: string,
  options?: { isFirstRun?: boolean; backupsDir?: string }
): Promise<MigrationResult> {
  const isFirstRun = Boolean(options?.isFirstRun);
  const backupsDir = options?.backupsDir || path.join(cwd, "backups");

  console.log(`[MigrationRunner] Starting database schema verification (isFirstRun: ${isFirstRun})...`);

  const schemaPath = app.isPackaged
    ? path.join(process.resourcesPath, "prisma", "schema.prisma")
    : path.resolve(cwd, "prisma", "schema.prisma");

  if (!fs.existsSync(schemaPath)) {
    console.warn(`[MigrationRunner] Shared schema.prisma not found at expected path: ${schemaPath}`);
    return { success: false, message: `schema.prisma not found at: ${schemaPath}` };
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    APP_MODE: "offline",
  };

  if (app.isPackaged) {
    const unpackedSchemaEnginePath = path.join(
      process.resourcesPath,
      "app.asar.unpacked",
      "node_modules",
      "@prisma",
      "engines",
      "schema-engine-windows.exe"
    );
    env.PRISMA_SCHEMA_ENGINE_BINARY = unpackedSchemaEnginePath;
    env.PRISMA_MIGRATION_ENGINE_BINARY = unpackedSchemaEnginePath;
    env.PRISMA_QUERY_ENGINE_LIBRARY = path.join(
      process.resourcesPath,
      "app.asar.unpacked",
      "node_modules",
      "@prisma",
      "engines",
      "query_engine-windows.dll.node"
    );
  }

  const candAsar = path.join(process.resourcesPath, "app.asar", "node_modules", "prisma", "build", "index.js");
  const candApp = path.join(process.resourcesPath, "app", "node_modules", "prisma", "build", "index.js");
  console.log(`[MigrationRunner Path Diagnostic]
    process.resourcesPath: ${process.resourcesPath}
    candAsar path: ${candAsar}
    candAsar exists: ${fs.existsSync(candAsar)}
    candApp path: ${candApp}
    candApp exists: ${fs.existsSync(candApp)}`);

  const packagedPrismaJs = fs.existsSync(candAsar) ? candAsar : candApp;
  const devPrismaJs = path.join(cwd, "node_modules", "prisma", "build", "index.js");

  let prismaCliJs: string | null = null;
  if (fs.existsSync(packagedPrismaJs)) {
    prismaCliJs = packagedPrismaJs;
  } else if (fs.existsSync(devPrismaJs)) {
    prismaCliJs = devPrismaJs;
  }

  const executionCwd = app.isPackaged ? path.dirname(process.execPath) : cwd;

  // Optimized Backup Execution:
  // For existing production database, check if pending migrations exist BEFORE creating backup
  if (!isFirstRun) {
    console.log(`[MigrationRunner] Checking for pending database schema migrations...`);
    const hasPending = await checkPendingMigrationsExist(executionCwd, schemaPath, prismaCliJs, env);
    if (!hasPending) {
      console.log(`[MigrationRunner] Database schema is up to date. No pending migrations found. Skipping pre-migration backup.`);
      return { success: true, message: "Database schema is up to date." };
    }

    console.log(`[MigrationRunner] Pending schema migrations detected. Initiating automatic pre-migration backup...`);
    const backupOk = await createPreMigrationBackup(databaseUrl, backupsDir);
    if (!backupOk) {
      return {
        success: false,
        message: "Automatic pre-migration backup failed. Aborting database migration to protect user data.",
      };
    }
  }

  console.log(`[MigrationRunner] Executing: prisma migrate deploy`);
  try {
    let stdout: string;
    if (prismaCliJs) {
      if (app.isPackaged) {
        env.ELECTRON_RUN_AS_NODE = "1";
      }
      stdout = await runCommand(
        app.isPackaged ? process.execPath : "node.exe",
        [prismaCliJs, "migrate", "deploy", `--schema=${schemaPath}`],
        executionCwd,
        env
      );
    } else {
      stdout = await runCommand(
        "npx",
        ["prisma", "migrate", "deploy", `--schema=${schemaPath}`],
        executionCwd,
        env
      );
    }
    console.log("[MigrationRunner] Migration output:\n", stdout);
  } catch (migErr: any) {
    console.error("[MigrationRunner] prisma migrate deploy failed:", migErr.message);
    return {
      success: false,
      message: `Database migration failed: ${migErr.message}. Pre-migration backup has been preserved in backups folder.`,
    };
  }

  // First-run seed execution: Brand new database only, or if database has no schools seeded
  let needsSeeding = isFirstRun;
  if (!needsSeeding) {
    try {
      const tempPrisma = new PrismaClient({
        datasources: { db: { url: databaseUrl } },
        log: [],
      });
      const schoolCount = await tempPrisma.school.count();
      if (schoolCount === 0) {
        needsSeeding = true;
        console.log("[MigrationRunner] Database has 0 schools. Triggering seed...");
      }
      await tempPrisma.$disconnect();
    } catch (e) {
      needsSeeding = true;
    }
  }

  if (needsSeeding) {
    console.log(`[MigrationRunner] Seeding database...`);
    const packagedSeedJs = path.join(process.resourcesPath, "app", "dist", "seed", "prisma", "seed.js");
    const devSeedJs = path.join(cwd, "dist", "seed", "prisma", "seed.js");
    const seedTsPath = path.resolve(cwd, "prisma", "seed.ts");

    try {
      let seedOut: string;
      if (fs.existsSync(packagedSeedJs)) {
        env.ELECTRON_RUN_AS_NODE = "1";
        seedOut = await runCommand(process.execPath, [packagedSeedJs], executionCwd, env);
      } else if (fs.existsSync(devSeedJs)) {
        if (app.isPackaged) {
          env.ELECTRON_RUN_AS_NODE = "1";
        }
        seedOut = await runCommand(app.isPackaged ? process.execPath : "node.exe", [devSeedJs], cwd, env);
      } else if (fs.existsSync(seedTsPath)) {
        seedOut = await runCommand("npx", ["tsx", seedTsPath], cwd, env);
      } else {
        seedOut = "No seed script found.";
      }
      console.log("[MigrationRunner] Seed output:\n", seedOut);
    } catch (seedErr: any) {
      console.warn("[MigrationRunner] Seed warning (non-fatal):", seedErr.message);
    }
  }

  return { success: true, message: "Portable SQLite database schema synchronized successfully." };
}
