#!/usr/bin/env node
const net = require("net");
const { spawn } = require("child_process");

function isPortVacant(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen({ port, host }, () => {
      server.close(() => resolve(true));
    });
  });
}

async function findVacantPort(preferredPorts = [3000, 5000, 8000]) {
  // 1. Check preferred ports in order: 3000, 5000, 8000
  for (const port of preferredPorts) {
    if (await isPortVacant(port)) {
      return port;
    }
  }

  // 2. Check nearby fallback ranges
  const fallbackRanges = [
    [3001, 3010],
    [5001, 5010],
    [8001, 8010],
  ];

  for (const [start, end] of fallbackRanges) {
    for (let p = start; p <= end; p++) {
      if (await isPortVacant(p)) {
        return p;
      }
    }
  }

  // 3. Fallback to OS-assigned port
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.listen(0, "127.0.0.1", () => {
      const addr = s.address();
      const port = addr.port;
      s.close(() => resolve(port));
    });
    s.on("error", reject);
  });
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const filteredArgs = [];

  for (const arg of rawArgs) {
    if (arg === "--cloud") {
      process.env.APP_MODE = "cloud";
    } else if (arg === "--offline") {
      process.env.APP_MODE = "offline";
    } else {
      filteredArgs.push(arg);
    }
  }

  const customPort = process.env.PORT ? parseInt(process.env.PORT, 10) : null;
  let port;

  if (customPort && (await isPortVacant(customPort))) {
    port = customPort;
  } else {
    if (customPort) {
      console.warn(`[Dev] Specified PORT ${customPort} is currently busy. Searching for a vacant port...`);
    }
    port = await findVacantPort([3000, 5000, 8000]);
  }

  if (port !== 3000 && !customPort) {
    console.log(`\x1b[33m[Dev] Notice: Port 3000 is occupied. Automatically running dev server on vacant port ${port}.\x1b[0m`);
  } else {
    console.log(`\x1b[32m[Dev] Starting dev server on port ${port}...\x1b[0m`);
  }

  const serverUrl = `http://127.0.0.1:${port}`;
  process.env.PORT = String(port);
  process.env.BETTER_AUTH_URL = process.env.BETTER_AUTH_URL || serverUrl;
  process.env.NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || serverUrl;

  const isWin = process.platform === "win32";
  const cmd = isWin ? "npx.cmd" : "npx";

  // Build next dev arguments: default to turbopack unless user specifies otherwise
  const hasTurbopack = filteredArgs.some((a) => a.includes("turbopack"));
  const turbopackFlag = hasTurbopack ? [] : ["--turbopack"];

  const nextArgs = [
    "next",
    "dev",
    ...turbopackFlag,
    "-H",
    "127.0.0.1",
    "-p",
    String(port),
    ...filteredArgs.filter((a) => !a.includes("turbopack")),
  ];

  const child = spawn(cmd, nextArgs, {
    stdio: "inherit",
    env: {
      ...process.env,
      PORT: String(port),
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
      APP_MODE: process.env.APP_MODE || "offline",
    },
    shell: isWin,
  });

  child.on("exit", (code, signal) => {
    process.exit(code ?? (signal ? 1 : 0));
  });

  ["SIGINT", "SIGTERM", "SIGHUP"].forEach((sig) => {
    process.on(sig, () => {
      if (!child.killed) {
        child.kill(sig);
      }
    });
  });
}

if (require.main === module) {
  main().catch((err) => {
    console.error("[Dev] Failed to start dev server:", err);
    process.exit(1);
  });
}

module.exports = { isPortVacant, findVacantPort };
