import net from "net";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface PostgresCheckResult {
  ready: boolean;
  message: string;
  port: number;
}

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

export async function ensureLocalPostgresRunning(port: number = 5432): Promise<PostgresCheckResult> {
  const isPortOpen = await checkPostgresPort(port);
  if (isPortOpen) {
    return {
      ready: true,
      message: `Local PostgreSQL is active and accepting connections on port ${port}`,
      port,
    };
  }

  // Attempt starting Windows PostgreSQL service if not active
  if (process.platform === "win32") {
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

  // Polling for readiness up to 10 seconds
  const startTime = Date.now();
  while (Date.now() - startTime < 10000) {
    const ready = await checkPostgresPort(port);
    if (ready) {
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
    message: `Local PostgreSQL is not running on port ${port}. Please ensure PostgreSQL service is started.`,
    port,
  };
}
