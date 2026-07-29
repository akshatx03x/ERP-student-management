import path from "path";
import fs from "fs";
import { app } from "electron";

export interface AppPaths {
  isPackaged: boolean;
  userDataDir: string;
  logsDir: string;
  postgresDataDir: string;
  configDir: string;
  tempDir: string;
  uploadsDir: string;
  backupsDir: string;
  // Read-only resource paths
  resourcesDir: string;
  standaloneServerJs: string | null;
  prismaSchemaPath: string;
  prismaCliJs: string | null;
  seedScriptJs: string | null;
  embeddedPostgresBinDir: string | null;
}

export function getOrCreateDesktopAuthSecret(configDir: string): string {
  const secretFile = path.join(configDir, "auth-secret.key");
  if (fs.existsSync(secretFile)) {
    try {
      const existingSecret = fs.readFileSync(secretFile, "utf-8").trim();
      if (existingSecret) {
        return existingSecret;
      }
    } catch (err) {
      console.warn("[Paths] Error reading persisted auth secret key file:", err);
    }
  }

  // Generate a cryptographically secure 256-bit secret for desktop offline auth
  const crypto = require("crypto");
  const newSecret = crypto.randomBytes(32).toString("hex");
  try {
    fs.writeFileSync(secretFile, newSecret, "utf-8");
    console.log(`[Paths] Generated and persisted new desktop auth secret at: ${secretFile}`);
  } catch (err) {
    console.warn("[Paths] Failed to persist generated auth secret file:", err);
  }
  return newSecret;
}

export function ensureWritableDirectoriesExist(): {
  userDataDir: string;
  logsDir: string;
  postgresDataDir: string;
  configDir: string;
  tempDir: string;
  uploadsDir: string;
  backupsDir: string;
  storageDir: string;
} {
  const userDataDir = app.getPath("userData");
  const logsDir = path.join(userDataDir, "logs");
  const postgresDataDir = path.join(userDataDir, "postgres-data");
  const configDir = path.join(userDataDir, "config");
  const tempDir = path.join(userDataDir, "temp");
  const uploadsDir = path.join(userDataDir, "uploads");
  const backupsDir = path.join(userDataDir, "backups");

  const storageDir = path.join(userDataDir, "storage");

  const dirs = [userDataDir, logsDir, postgresDataDir, configDir, tempDir, uploadsDir, backupsDir, storageDir];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  return {
    userDataDir,
    logsDir,
    postgresDataDir,
    configDir,
    tempDir,
    uploadsDir,
    backupsDir,
    storageDir,
  };
}

export function getAppPaths(projectRootDir: string): AppPaths {
  const isPackaged = app.isPackaged;
  const writable = ensureWritableDirectoriesExist();
  const resourcesDir = process.resourcesPath;

  // Read-only standalone server resolution
  const packagedStandaloneServer = path.join(resourcesDir, "app", "server.js");
  const devStandaloneServer = path.join(projectRootDir, ".next", "standalone", "server.js");

  let standaloneServerJs: string | null = null;
  if (isPackaged && fs.existsSync(packagedStandaloneServer)) {
    standaloneServerJs = packagedStandaloneServer;
  } else if (fs.existsSync(devStandaloneServer)) {
    standaloneServerJs = devStandaloneServer;
  }

  // Read-only Prisma schema resolution
  const prismaSchemaPath = isPackaged
    ? path.join(resourcesDir, "prisma", "schema.prisma")
    : path.resolve(projectRootDir, "prisma", "schema.prisma");

  // Read-only Prisma CLI resolution
  const packagedPrismaJs = path.join(resourcesDir, "app", "node_modules", "prisma", "build", "index.js");
  const devPrismaJs = path.join(projectRootDir, "node_modules", "prisma", "build", "index.js");
  let prismaCliJs: string | null = null;
  if (fs.existsSync(packagedPrismaJs)) {
    prismaCliJs = packagedPrismaJs;
  } else if (fs.existsSync(devPrismaJs)) {
    prismaCliJs = devPrismaJs;
  }

  // Read-only seed script resolution
  const packagedSeedJs = path.join(resourcesDir, "app", "dist", "seed", "prisma", "seed.js");
  const devSeedJs = path.join(projectRootDir, "dist", "seed", "prisma", "seed.js");
  let seedScriptJs: string | null = null;
  if (fs.existsSync(packagedSeedJs)) {
    seedScriptJs = packagedSeedJs;
  } else if (fs.existsSync(devSeedJs)) {
    seedScriptJs = devSeedJs;
  }

  // Read-only embedded postgres binary resolution
  const candidatePgBins = [
    path.join(resourcesDir, "postgres", "bin"),
    path.join(__dirname, "../../vendor/postgres/win-x64/bin"),
    path.join(projectRootDir, "desktop/vendor/postgres/win-x64/bin"),
  ];

  let embeddedPostgresBinDir: string | null = null;
  for (const binPath of candidatePgBins) {
    const pgCtl = path.join(binPath, process.platform === "win32" ? "pg_ctl.exe" : "pg_ctl");
    if (fs.existsSync(pgCtl)) {
      embeddedPostgresBinDir = binPath;
      break;
    }
  }

  return {
    isPackaged,
    userDataDir: writable.userDataDir,
    logsDir: writable.logsDir,
    postgresDataDir: writable.postgresDataDir,
    configDir: writable.configDir,
    tempDir: writable.tempDir,
    uploadsDir: writable.uploadsDir,
    backupsDir: writable.backupsDir,
    resourcesDir,
    standaloneServerJs,
    prismaSchemaPath,
    prismaCliJs,
    seedScriptJs,
    embeddedPostgresBinDir,
  };
}
