import { spawn, ChildProcess } from "child_process";
import http from "http";
import path from "path";
import fs from "fs";
import { app } from "electron";

export type ServerState = "stopped" | "starting" | "running";

let serverState: ServerState = "stopped";
let activeStartPromise: Promise<string> | null = null;

let serverProcess: ChildProcess | null = null;
let serverProcessExited = false;
let serverExitCode: number | null = null;
let serverExitSignal: string | null = null;
let stderrBuffer: string[] = [];

export interface ServerManagerConfig {
  rootDir: string;
  port: number;
  appMode: "cloud" | "offline";
  databaseUrl: string;
}

export function getServerState(): ServerState {
  return serverState;
}

export function isServerReady(port: number, attempt: number = 1): Promise<boolean> {
  return new Promise((resolve) => {
    const targetUrl = `http://127.0.0.1:${port}/api/health`;
    if (attempt > 0) {
      console.log(`[NextServerManager] Attempt #${attempt} - GET ${targetUrl}`);
    }

    const req = http.get(targetUrl, { timeout: 3000 }, (res) => {
      let body = "";
      res.on("data", (chunk) => {
        body += chunk;
      });

      res.on("end", () => {
        const status = res.statusCode;
        if (attempt > 0) {
          console.log(`[NextServerManager] Attempt #${attempt} - GET ${targetUrl} -> Status: ${status}, Body: ${body.trim()}`);
        }

        if (status === 200) {
          try {
            const parsed = JSON.parse(body);
            if (parsed && parsed.status === "ok") {
              if (attempt > 0) {
                console.log(`[NextServerManager] Health check PASSED on attempt #${attempt}`);
              }
              return resolve(true);
            }
          } catch (e) {
            if (attempt > 0) {
              console.log(`[NextServerManager] Attempt #${attempt} - JSON parse error for health check response`);
            }
          }
        }
        resolve(false);
      });
    });

    req.on("error", (err) => {
      if (attempt > 0) {
        console.log(`[NextServerManager] Attempt #${attempt} - GET ${targetUrl} -> Error: ${err.message}`);
      }
      resolve(false);
    });

    req.on("timeout", () => {
      if (attempt > 0) {
        console.log(`[NextServerManager] Attempt #${attempt} - GET ${targetUrl} -> Timed out`);
      }
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

export function startNextServer(config: ServerManagerConfig): Promise<string> {
  const stack = new Error().stack;
  console.log(`[NextServerManager] startNextServer() called. Current state: ${serverState}`);
  console.log(`[NextServerManager] Call stack:\n${stack}`);

  // Singleton Guard 1: Return URL immediately if already running
  if (serverState === "running") {
    console.log(`[NextServerManager] Server is already running. Returning existing server URL.`);
    return Promise.resolve(`http://127.0.0.1:${config.port}`);
  }

  // Singleton Guard 2: Return existing in-flight Promise if starting is already in progress
  if (serverState === "starting" && activeStartPromise) {
    console.log(`[NextServerManager] Server startup is already in progress. Returning active startup promise.`);
    return activeStartPromise;
  }

  serverState = "starting";

  activeStartPromise = (async () => {
    try {
      const port = config.port;
      const serverUrl = `http://127.0.0.1:${port}`;

      // Reset process tracking state
      serverProcessExited = false;
      serverExitCode = null;
      serverExitSignal = null;
      stderrBuffer = [];

      // If port is occupied by an external/orphaned process and we don't own it, attempt to kill or handle it
      const alreadyActive = await isServerReady(port, 0);
      if (alreadyActive && !serverProcess) {
        console.warn(`[NextServerManager] Port ${port} is occupied by an orphaned process. Terminating orphaned process...`);
        try {
          const { execSync } = require("child_process");
          if (process.platform === "win32") {
            execSync(`for /f "tokens=5" %a in ('netstat -aon ^| findstr :${port} ^| findstr LISTENING') do taskkill /F /PID %a`, { stdio: "ignore" });
          }
        } catch (e: any) {
          console.warn(`[NextServerManager] Failed to kill process on port ${port}:`, e.message);
        }
        await new Promise((r) => setTimeout(r, 1000));
      }

      // Check if child process is already spawned and running
      if (serverProcess && !serverProcess.killed && serverProcess.exitCode === null) {
        console.warn(`[NextServerManager] A child process is already attached and running. Awaiting server readiness...`);
      } else {
        const packagedCandidates = [
          path.join(process.resourcesPath, "app", "server.js"),
          path.join(app.getAppPath(), "app", "server.js"),
          path.join(process.resourcesPath, "app.asar.unpacked", "app", "server.js"),
        ];
        const devStandaloneServer = path.join(config.rootDir, ".next", "standalone", "server.js");

        let standaloneServerJs: string | null = null;
        if (app.isPackaged) {
          for (const cand of packagedCandidates) {
            if (fs.existsSync(cand)) {
              standaloneServerJs = cand;
              break;
            }
          }
          if (!standaloneServerJs) {
            console.error(`[NextServerManager CRITICAL] Standalone server file NOT found in candidates: ${JSON.stringify(packagedCandidates)}`);
            throw new Error(`Packaged Next.js server entrypoint not found. Checked: ${JSON.stringify(packagedCandidates)}.`);
          }
        } else if (fs.existsSync(devStandaloneServer)) {
          standaloneServerJs = devStandaloneServer;
        }

        const isProduction = !!standaloneServerJs || app.isPackaged;
        const modeName = isProduction
          ? `production standalone (${standaloneServerJs})`
          : "development (next dev --turbopack)";

        console.log(`[NextServerManager] Launching Next.js server child process on port ${port} in ${modeName} mode...`);

        const env: NodeJS.ProcessEnv = {
          ...process.env,
          PORT: String(port),
          HOSTNAME: "127.0.0.1",
          APP_MODE: config.appMode,
          DATABASE_URL: config.databaseUrl,
          BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || serverUrl,
          NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || serverUrl,
          BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
          NODE_ENV: isProduction ? "production" : "development",
        };

        console.log(`[NextServerManager] Child process env propagation verification:
          APP_MODE: ${env.APP_MODE}
          BETTER_AUTH_URL: ${env.BETTER_AUTH_URL}
          NEXT_PUBLIC_APP_URL: ${env.NEXT_PUBLIC_APP_URL}
          BETTER_AUTH_SECRET present: ${Boolean(env.BETTER_AUTH_SECRET)} (length: ${env.BETTER_AUTH_SECRET?.length ?? 0})
          DATABASE_URL: ${env.DATABASE_URL}`);

        let cmd: string;
        let args: string[];

        if (isProduction && standaloneServerJs) {
          // Use Electron executable with ELECTRON_RUN_AS_NODE=1 to act as Node.js runtime
          env.ELECTRON_RUN_AS_NODE = "1";
          cmd = process.execPath;
          args = [standaloneServerJs];
          console.log(`[NextServerManager] Executing standalone Next server with ${cmd} using ELECTRON_RUN_AS_NODE=1`);
        } else {
          const isWin = process.platform === "win32";
          cmd = isWin ? "npx.cmd" : "npx";
          args = ["next", "dev", "--turbopack", "-H", "127.0.0.1", "-p", String(port)];
        }

        const cwd = standaloneServerJs ? path.dirname(standaloneServerJs) : config.rootDir;
        if (!fs.existsSync(cwd)) {
          fs.mkdirSync(cwd, { recursive: true });
        }

        console.log(`[NextServerManager Spawn Inspection]
          cmd: "${cmd}" (exists: ${fs.existsSync(cmd)})
          args: ${JSON.stringify(args)}
          cwd: "${cwd}" (exists: ${fs.existsSync(cwd)})
          standaloneServerJs: "${standaloneServerJs}" (exists: ${Boolean(standaloneServerJs && fs.existsSync(standaloneServerJs))})
          ELECTRON_RUN_AS_NODE: "${env.ELECTRON_RUN_AS_NODE || ""}"`);

        serverProcess = spawn(cmd, args, {
          cwd,
          env,
          shell: !isProduction,
          stdio: ["pipe", "pipe", "pipe"],
        });

        const logDir = path.join(app.getPath("userData"), "logs");
        if (!fs.existsSync(logDir)) {
          fs.mkdirSync(logDir, { recursive: true });
        }
        const serverLogFile = path.join(logDir, "server.log");

        serverProcess.stdout?.on("data", (data) => {
          const text = data.toString().trim();
          if (text) {
            console.log(`[NextServer] ${text}`);
            try { fs.appendFileSync(serverLogFile, `[STDOUT] ${new Date().toISOString()} ${text}\n`); } catch {}
          }
        });

        serverProcess.stderr?.on("data", (data) => {
          const text = data.toString().trim();
          if (text) {
            console.warn(`[NextServer Err] ${text}`);
            try { fs.appendFileSync(serverLogFile, `[STDERR] ${new Date().toISOString()} ${text}\n`); } catch {}
            stderrBuffer.push(text);
            if (stderrBuffer.length > 50) {
              stderrBuffer.shift();
            }
          }
        });

        serverProcess.on("exit", (code, signal) => {
          console.log(`[NextServerManager] Child process exited with code ${code}, signal ${signal}`);
          serverProcessExited = true;
          serverExitCode = code;
          serverExitSignal = signal ? String(signal) : null;
          serverProcess = null;
          if (serverState !== "running") {
            serverState = "stopped";
          }
        });
      }

      // Wait up to 45 seconds for server startup
      const startTime = Date.now();
      let attempt = 1;

      while (Date.now() - startTime < 45000) {
        if (serverProcessExited) {
          const errLogs = stderrBuffer.length > 0 ? stderrBuffer.join("\n") : "No stderr logs captured.";
          serverState = "stopped";
          throw new Error(
            `Next.js server child process exited prematurely with code ${serverExitCode} (signal: ${serverExitSignal}).\nStderr:\n${errLogs}`
          );
        }

        const ready = await isServerReady(port, attempt++);
        if (ready) {
          console.log(`[NextServerManager] Next.js server is ready and serving at ${serverUrl}`);
          serverState = "running";
          return serverUrl;
        }

        if (serverProcessExited) {
          const errLogs = stderrBuffer.length > 0 ? stderrBuffer.join("\n") : "No stderr logs captured.";
          serverState = "stopped";
          throw new Error(
            `Next.js server child process exited prematurely with code ${serverExitCode} (signal: ${serverExitSignal}).\nStderr:\n${errLogs}`
          );
        }

        await new Promise((r) => setTimeout(r, 1000));
      }

      serverState = "stopped";
      throw new Error(`Timeout waiting for Next.js server to start on port ${port}`);
    } catch (err) {
      serverState = "stopped";
      throw err;
    } finally {
      activeStartPromise = null;
    }
  })();

  return activeStartPromise;
}

export function stopNextServer(): void {
  if (serverProcess) {
    console.log("[NextServerManager] Terminating Next.js server child process...");
    serverProcess.kill("SIGTERM");
    serverProcess = null;
  }
  serverState = "stopped";
  activeStartPromise = null;
}
