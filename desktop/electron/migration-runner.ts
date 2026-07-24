import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { app } from "electron";

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

export async function runPendingPrismaMigrations(cwd: string, databaseUrl: string): Promise<MigrationResult> {
  console.log(`[MigrationRunner] Starting database schema synchronization for local offline database...`);

  // Resolve schema path
  const schemaPath = app.isPackaged
    ? path.join(process.resourcesPath, "prisma", "schema.prisma")
    : path.resolve(cwd, "prisma", "schema.prisma");

  if (!fs.existsSync(schemaPath)) {
    console.warn(`[MigrationRunner] Shared schema.prisma not found at expected path: ${schemaPath}`);
    return { success: false, message: `schema.prisma not found at: ${schemaPath}` };
  }

  // Override DATABASE_URL and DIRECT_URL to local database URL
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    DATABASE_URL_LOCAL: databaseUrl,
    DIRECT_URL: databaseUrl,
    APP_MODE: "offline",
  };

  // Find bundled Prisma CLI js bundle
  const packagedPrismaJs = path.join(process.resourcesPath, "app", "node_modules", "prisma", "build", "index.js");
  const devPrismaJs = path.join(cwd, "node_modules", "prisma", "build", "index.js");

  let prismaCliJs: string | null = null;
  if (fs.existsSync(packagedPrismaJs)) {
    prismaCliJs = packagedPrismaJs;
  } else if (fs.existsSync(devPrismaJs)) {
    prismaCliJs = devPrismaJs;
  }

  // Check for unpacked query engine binary location in packaged app
  const unpackedEnginePath = path.join(
    process.resourcesPath,
    "app.asar.unpacked",
    "node_modules",
    ".prisma",
    "client",
    "query_engine-windows.dll.node"
  );
  if (app.isPackaged && fs.existsSync(unpackedEnginePath)) {
    env.PRISMA_QUERY_ENGINE_LIBRARY = unpackedEnginePath;
    console.log(`[MigrationRunner] PRISMA_QUERY_ENGINE_LIBRARY set to: ${unpackedEnginePath}`);
  }

  const executionCwd = app.isPackaged ? app.getPath("userData") : cwd;

  console.log(`[MigrationRunner] Running: prisma db push --skip-generate (schema sync)`);
  try {
    let stdout: string;
    if (prismaCliJs) {
      env.ELECTRON_RUN_AS_NODE = "1";
      stdout = await runCommand(
        process.execPath,
        [prismaCliJs, "db", "push", "--skip-generate", "--accept-data-loss", `--schema=${schemaPath}`],
        executionCwd,
        env
      );
    } else {
      stdout = await runCommand(
        "npx",
        ["prisma", "db", "push", "--skip-generate", "--accept-data-loss", `--schema=${schemaPath}`],
        executionCwd,
        env
      );
    }
    console.log("[MigrationRunner] DB push output:\n", stdout);
  } catch (pushErr: any) {
    console.error("[MigrationRunner] prisma db push failed:", pushErr.message);
    return {
      success: false,
      message: `Database schema synchronization failed: ${pushErr.message}`,
    };
  }

  // Seed the database
  const packagedSeedJs = path.join(process.resourcesPath, "app", "dist", "seed", "prisma", "seed.js");
  const devSeedJs = path.join(cwd, "dist", "seed", "prisma", "seed.js");
  const seedTsPath = path.resolve(cwd, "prisma", "seed.ts");

  try {
    let seedOut: string;
    if (fs.existsSync(packagedSeedJs)) {
      console.log(`[MigrationRunner] Running packaged seed script: ${packagedSeedJs}`);
      env.ELECTRON_RUN_AS_NODE = "1";
      seedOut = await runCommand(process.execPath, [packagedSeedJs], executionCwd, env);
    } else if (fs.existsSync(devSeedJs)) {
      console.log(`[MigrationRunner] Running compiled dev seed script: ${devSeedJs}`);
      env.ELECTRON_RUN_AS_NODE = "1";
      seedOut = await runCommand(process.execPath, [devSeedJs], cwd, env);
    } else if (fs.existsSync(seedTsPath)) {
      console.log(`[MigrationRunner] Running dev tsx seed script: ${seedTsPath}`);
      seedOut = await runCommand("npx", ["tsx", seedTsPath], cwd, env);
    } else {
      seedOut = "No seed script found.";
    }
    console.log("[MigrationRunner] Seed output:\n", seedOut);
  } catch (seedErr: any) {
    console.warn("[MigrationRunner] Seed warning (non-fatal):", seedErr.message);
  }

  return { success: true, message: "Local database schema synchronized and seeded successfully." };
}

