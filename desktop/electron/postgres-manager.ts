import net from "net";
import { exec, spawnSync } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import { app } from "electron";

const execAsync = promisify(exec);

export interface PostgresCheckResult {
  ready: boolean;
  message: string;
  port: number;
}

let activePgDataDir: string | null = null;
let activePgBinDir: string | null = null;

export async function checkPostgresPort(port: number = 5432, host: string = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(2000);

    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });

    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });

    socket.on("error", () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect(port, host);
  });
}

function findEmbeddedPostgresBin(): string | null {
  const candidatePaths = [
    path.join(process.resourcesPath, "postgres", "bin"),
    path.join(__dirname, "../../vendor/postgres/win-x64/bin"),
    path.join(process.cwd(), "desktop/vendor/postgres/win-x64/bin"),
  ];

  for (const binPath of candidatePaths) {
    const pgCtl = path.join(binPath, process.platform === "win32" ? "pg_ctl.exe" : "pg_ctl");
    if (fs.existsSync(pgCtl)) {
      return binPath;
    }
  }
  return null;
}

export async function ensureLocalPostgresRunning(port: number = 5432): Promise<PostgresCheckResult> {
  const isPortOpen = await checkPostgresPort(port);
  if (isPortOpen) {
    return {
      ready: true,
      message: `Local PostgreSQL is active and accepting connections on port ${port}`,
      port,
    };
  }

  // Check for embedded PostgreSQL binaries
  const pgBinDir = findEmbeddedPostgresBin();
  if (pgBinDir) {
    console.log(`[PostgresManager] Found embedded PostgreSQL binaries at: ${pgBinDir}`);
    const dataDir = path.join(app.getPath("userData"), "postgres-data");
    activePgBinDir = pgBinDir;
    activePgDataDir = dataDir;

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const versionFile = path.join(dataDir, "PG_VERSION");
    if (!fs.existsSync(versionFile)) {
      console.log(`[PostgresManager] Initializing fresh PostgreSQL database cluster in ${dataDir}...`);
      const initDbExe = path.join(pgBinDir, "initdb.exe");
      const initResult = spawnSync(initDbExe, ["-D", dataDir, "-U", "postgres", "-A", "trust", "--encoding=UTF8"], {
        encoding: "utf-8",
      });
      console.log(`[PostgresManager] initdb output:\n${initResult.stdout || initResult.stderr}`);
    }

    console.log(`[PostgresManager] Starting embedded PostgreSQL server via pg_ctl...`);
    const pgCtlExe = path.join(pgBinDir, "pg_ctl.exe");
    const logFile = path.join(dataDir, "postgres.log");
    const startResult = spawnSync(pgCtlExe, ["-D", dataDir, "-l", logFile, "-o", `"-p ${port} -h 127.0.0.1"`, "start"], {
      encoding: "utf-8",
    });
    console.log(`[PostgresManager] pg_ctl start output:\n${startResult.stdout || startResult.stderr}`);
  } else if (process.platform === "win32") {
    // Attempt starting Windows system PostgreSQL service if embedded is not present
    try {
      console.log("[PostgresManager] Attempting to start Windows PostgreSQL service...");
      await execAsync("net start postgresql-x64-16", { windowsHide: true });
    } catch {
      try {
        await execAsync("net start postgresql-x64-15", { windowsHide: true });
      } catch (err: any) {
        console.warn("[PostgresManager] Automatic service start attempt skipped or required manual start:", err.message);
      }
    }
  }

  // Polling for readiness up to 15 seconds
  const startTime = Date.now();
  while (Date.now() - startTime < 15000) {
    const ready = await checkPostgresPort(port);
    if (ready) {
      // Ensure the "school_erp_offline" database exists
      if (pgBinDir) {
        const createDbExe = path.join(pgBinDir, "createdb.exe");
        if (fs.existsSync(createDbExe)) {
          spawnSync(createDbExe, ["-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "school_erp_offline"], {
            encoding: "utf-8",
          });
        }
      }

      return {
        ready: true,
        message: `Local PostgreSQL service started and ready on port ${port}`,
        port,
      };
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  return {
    ready: false,
    message: `Local PostgreSQL is not running on port ${port}. Please ensure PostgreSQL is started.`,
    port,
  };
}

export function stopEmbeddedPostgres(): void {
  if (activePgBinDir && activePgDataDir) {
    console.log(`[PostgresManager] Stopping embedded PostgreSQL server...`);
    const pgCtlExe = path.join(activePgBinDir, "pg_ctl.exe");
    if (fs.existsSync(pgCtlExe)) {
      spawnSync(pgCtlExe, ["-D", activePgDataDir, "stop", "-m", "fast"], { encoding: "utf-8" });
    }
  }
}

