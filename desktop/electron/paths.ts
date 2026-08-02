import path from "path";
import fs from "fs";
import { app } from "electron";

export interface AppPaths {
  isPackaged: boolean;
  baseDataDir: string;
  dataDir: string;
  dbFilePath: string;
  logsDir: string;
  configDir: string;
  tempDir: string;
  uploadsDir: string;
  backupsDir: string;
  storageDir: string;
  resourcesDir: string;
  standaloneServerJs: string | null;
  prismaSchemaPath: string;
  prismaCliJs: string | null;
  seedScriptJs: string | null;
}

export function getPortableBaseDirectory(): string {
  if (process.env.OFFLINE_DATA_DIR && process.env.OFFLINE_DATA_DIR.trim() !== "") {
    return process.env.OFFLINE_DATA_DIR.trim();
  }
  if (app && app.isPackaged) {
    return path.dirname(process.execPath);
  }
  return process.cwd();
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

  const crypto = require("crypto");
  const newSecret = crypto.randomBytes(32).toString("hex");
  try {
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(secretFile, newSecret, "utf-8");
    console.log(`[Paths] Generated and persisted new desktop auth secret at: ${secretFile}`);
  } catch (err) {
    console.warn("[Paths] Failed to persist generated auth secret file:", err);
  }
  return newSecret;
}

export function ensureWritableDirectoriesExist(): {
  baseDataDir: string;
  dataDir: string;
  dbFilePath: string;
  logsDir: string;
  configDir: string;
  tempDir: string;
  uploadsDir: string;
  backupsDir: string;
  storageDir: string;
} {
  const baseDataDir = getPortableBaseDirectory();
  const dataDir = path.join(baseDataDir, "data");
  const dbFilePath = path.join(dataDir, "school.db");
  const logsDir = path.join(baseDataDir, "logs");
  const configDir = path.join(baseDataDir, "config");
  const tempDir = path.join(baseDataDir, "temp");
  const uploadsDir = path.join(baseDataDir, "uploads");
  const backupsDir = path.join(baseDataDir, "backups");
  const storageDir = path.join(baseDataDir, "storage");

  const dirs = [dataDir, logsDir, configDir, tempDir, uploadsDir, backupsDir, storageDir];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  return {
    baseDataDir,
    dataDir,
    dbFilePath,
    logsDir,
    configDir,
    tempDir,
    uploadsDir,
    backupsDir,
    storageDir,
  };
}

export function getAppPaths(projectRootDir: string): AppPaths {
  const isPackaged = Boolean(app && app.isPackaged);
  const writable = ensureWritableDirectoriesExist();
  const resourcesDir = process.resourcesPath || projectRootDir;

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
  // electron-builder asarUnpack extracts *.exe and *.node, causing the prisma package itself
  // to be placed into app.asar.unpacked. Check there first before falling back to app/.
  const packagedPrismaJs = fs.existsSync(path.join(resourcesDir, "app.asar.unpacked", "node_modules", "prisma", "build", "index.js"))
    ? path.join(resourcesDir, "app.asar.unpacked", "node_modules", "prisma", "build", "index.js")
    : path.join(resourcesDir, "app", "node_modules", "prisma", "build", "index.js");
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

  return {
    isPackaged,
    baseDataDir: writable.baseDataDir,
    dataDir: writable.dataDir,
    dbFilePath: writable.dbFilePath,
    logsDir: writable.logsDir,
    configDir: writable.configDir,
    tempDir: writable.tempDir,
    uploadsDir: writable.uploadsDir,
    backupsDir: writable.backupsDir,
    storageDir: writable.storageDir,
    resourcesDir,
    standaloneServerJs,
    prismaSchemaPath,
    prismaCliJs,
    seedScriptJs,
  };
}
