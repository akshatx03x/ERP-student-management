import { app, BrowserWindow, dialog, session } from "electron";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { registerIpcHandlers } from "./ipc";
import { checkSqliteDatabaseIntegrity, acquireSingleInstanceLock, releaseSingleInstanceLock } from "./sqlite-manager";
import { runPendingPrismaMigrations } from "./migration-runner";
import { startNextServer, stopNextServer } from "./next-server-manager";
import { ensureWritableDirectoriesExist, getOrCreateDesktopAuthSecret, getPortableBaseDirectory } from "./paths";

// Set up Prisma engine paths for packaged runtime
if (app.isPackaged) {
  const resourcesDir = process.resourcesPath;
  process.env.PRISMA_QUERY_ENGINE_LIBRARY = path.join(
    resourcesDir,
    "app.asar.unpacked",
    "node_modules",
    "@prisma",
    "engines",
    "query_engine-windows.dll.node"
  );
  process.env.PRISMA_SCHEMA_ENGINE_BINARY = path.join(
    resourcesDir,
    "app.asar.unpacked",
    "node_modules",
    "@prisma",
    "engines",
    "schema-engine-windows.exe"
  );
  process.env.PRISMA_MIGRATION_ENGINE_BINARY = process.env.PRISMA_SCHEMA_ENGINE_BINARY;
}

app.commandLine.appendSwitch("proxy-bypass-list", "<-loopback>,localhost,127.0.0.1");
app.commandLine.appendSwitch("proxy-server", "direct://");
app.commandLine.appendSwitch("no-proxy-server");

let mainWindow: BrowserWindow | null = null;

let splashWindow: BrowserWindow | null = null;

// Stored during bootstrapDesktopApp so the will-quit handler can release the lock.
let portableDbFilePath: string | null = null;

function createSplashWindow(): BrowserWindow {
  console.log("[SplashWindow] Creating splash window instance...");
  const splash = new BrowserWindow({
    width: 480,
    height: 320,
    frame: false,
    transparent: true,
    resizable: false,
    center: true,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  splash.once("ready-to-show", () => {
    console.log("[SplashWindow Event] ready-to-show - Showing splash window.");
    splash.show();
  });

  splash
    .loadFile(path.join(__dirname, "splash.html"))
    .then(() => {
      console.log("[SplashWindow] loadFile resolved successfully.");
    })
    .catch((err) => {
      console.error("[SplashWindow] loadFile failed:", err);
    });

  return splash;
}

function updateSplashProgress(status: string, progress: number): void {
  console.log(`[StartupProgress ${progress}%] ${status}`);
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send("splash:progress", { status, progress });
  }
}

async function createMainWindow(serverUrl: string): Promise<BrowserWindow> {
  console.log(`[MainWindow] Creating main BrowserWindow instance for target URL: ${serverUrl}`);

  await session.defaultSession.setProxy({ proxyRules: "direct://" });
  const window = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 600,
    title: "SchoolERP Desktop Edition",
    autoHideMenuBar: true,
    show: false,
    backgroundColor: "#0f172a",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  window.once("ready-to-show", () => {
    console.log("[MainWindow Event] ready-to-show fired!");
    window.show();
    window.focus();
    if (!app.isPackaged) {
      window.webContents.openDevTools();
    }
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
  });

  window.on("closed", () => {
    mainWindow = null;
  });

  try {
    await window.loadURL(serverUrl);
    console.log(`[MainWindow] loadURL(${serverUrl}) resolved successfully.`);
  } catch (err: any) {
    console.error(`[MainWindow] loadURL(${serverUrl}) failed:`, err);
    throw err;
  }

  if (!window.isVisible()) {
    window.show();
    window.focus();
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
  }

  return window;
}

function findProjectRootDir(startDir: string): string {
  let current = startDir;
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, "prisma", "schema.prisma"))) {
      return current;
    }
    current = path.dirname(current);
  }
  return path.resolve(startDir, "../../../..");
}

const writablePaths = ensureWritableDirectoriesExist();
process.env.OFFLINE_DATA_DIR = writablePaths.baseDataDir;
process.env.OFFLINE_UPLOAD_DIR = writablePaths.uploadsDir;
process.env.OFFLINE_BACKUP_DIR = writablePaths.backupsDir;
process.env.OFFLINE_STORAGE_DIR = writablePaths.storageDir;
process.env.OFFLINE_LOG_DIR = writablePaths.logsDir;
process.env.OFFLINE_TEMP_DIR = writablePaths.tempDir;

function logMain(message: string, isError: boolean = false) {
  const timestamp = new Date().toISOString();
  const prefix = isError ? "[ERROR]" : "[INFO]";
  const line = `[${timestamp}] ${prefix} ${message}\n`;
  console.log(message);
  try {
    const logFile = path.join(writablePaths.logsDir, "main.log");
    fs.appendFileSync(logFile, line, "utf8");
  } catch (err) {
    console.error("Failed to write to main.log:", err);
  }
}

// Exception and Rejection Logging
process.on("uncaughtException", (error) => {
  const msg = `Uncaught Exception: ${error?.message || error}\nStack: ${error?.stack}`;
  logMain(msg, true);
});

process.on("unhandledRejection", (reason, promise) => {
  const msg = `Unhandled Rejection at: ${promise}\nReason: ${reason instanceof Error ? reason.stack : reason}`;
  logMain(msg, true);
});

let isBootstrapping = false;
let isBootstrapped = false;

async function bootstrapDesktopApp(): Promise<void> {
  if (isBootstrapping || isBootstrapped) {
    return;
  }
  isBootstrapping = true;

  logMain("=========================================");
  logMain(" Starting SchoolERP Portable Desktop ERP ");
  logMain(" Mode: Single-User Portable SQLite      ");
  logMain("=========================================");

  // Logging process info as requested
  logMain(`[Environment Diagnostics]
    process.cwd(): "${process.cwd()}"
    process.resourcesPath: "${process.resourcesPath || "undefined"}"
    __dirname: "${__dirname}"
    app.getPath("userData"): "${app.getPath("userData")}"
    app.getAppPath(): "${app.getAppPath()}"
    app.isPackaged: ${app.isPackaged}`);

  splashWindow = createSplashWindow();
  updateSplashProgress("Initializing portable environment...", 10);

  const projectRootDir = findProjectRootDir(__dirname);

  const candidateEnvPaths = [
    path.join(process.resourcesPath, ".env"),
    path.join(writablePaths.configDir, ".env"),
    path.join(projectRootDir, ".env"),
  ];

  for (const envPath of candidateEnvPaths) {
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
      logMain(`[Main] Loaded environment from: ${envPath}`);
      break;
    }
  }

  process.env.APP_MODE = "offline";
  process.env.BETTER_AUTH_URL = process.env.BETTER_AUTH_URL || "http://127.0.0.1:3000";
  process.env.NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3000";

  if (!process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET.trim() === "") {
    const desktopSecret = getOrCreateDesktopAuthSecret(writablePaths.configDir);
    process.env.BETTER_AUTH_SECRET = desktopSecret;
  }

  logMain(`[Better Auth Env]
    BETTER_AUTH_URL: "${process.env.BETTER_AUTH_URL}"
    NEXT_PUBLIC_APP_URL: "${process.env.NEXT_PUBLIC_APP_URL}"
    BETTER_AUTH_SECRET length: ${process.env.BETTER_AUTH_SECRET ? process.env.BETTER_AUTH_SECRET.length : 0}`);

  updateSplashProgress("Registering application IPC services...", 25);
  registerIpcHandlers();

  // If the database exists but has 0 bytes, it is corrupted or incomplete from a crashed startup.
  // We delete it to allow a fresh migration and seeding to occur.
  if (fs.existsSync(writablePaths.dbFilePath) && fs.statSync(writablePaths.dbFilePath).size === 0) {
    logMain("[Main] Detected 0-byte database file. Deleting to trigger fresh migration and seeding.");
    try {
      fs.unlinkSync(writablePaths.dbFilePath);
    } catch (err: any) {
      logMain(`[Main Warning] Failed to clean up 0-byte database file: ${err.message}`);
    }
  }

  const isFirstRun = !fs.existsSync(writablePaths.dbFilePath);

  updateSplashProgress("Running SQLite database integrity check...", 40);
  const integrityResult = await checkSqliteDatabaseIntegrity(writablePaths.dbFilePath);
  if (!integrityResult.ok) {
    updateSplashProgress("Database Integrity Error!", 40);
    dialog.showErrorBox(
      "Database Corruption Error",
      `The SQLite database file appears to be damaged or corrupted.\n\nDetail: ${integrityResult.message}\n\nPlease restore a valid database snapshot from your backups folder.`
    );
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
    }
    app.quit();
    return;
  }

  // Acquire single-instance lock to prevent two ERP instances from opening
  // the same SQLite database simultaneously (WAL-mode concurrent writes can corrupt the DB).
  const lockResult = acquireSingleInstanceLock(writablePaths.dbFilePath);
  if (!lockResult.acquired) {
    updateSplashProgress("Another instance is running.", 40);
    dialog.showErrorBox("School ERP Is Already Running", lockResult.message);
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
    }
    app.quit();
    return;
  }
  portableDbFilePath = writablePaths.dbFilePath;

  const sqliteUrl = `file:${writablePaths.dbFilePath}`;
  process.env.DATABASE_URL = sqliteUrl;

  logMain(`[Main Environment Summary]
  APP_MODE: ${process.env.APP_MODE}
  Portable Base Directory: ${writablePaths.baseDataDir}
  SQLite DB File: ${writablePaths.dbFilePath}
  Is First Run: ${isFirstRun}
  DATABASE_URL: "${process.env.DATABASE_URL}"`);

  updateSplashProgress("Applying SQLite database migrations...", 60);
  const migrationResult = await runPendingPrismaMigrations(projectRootDir, sqliteUrl, {
    isFirstRun,
    backupsDir: writablePaths.backupsDir,
  });
  if (!migrationResult.success) {
    updateSplashProgress("Database Migration Error!", 60);
    dialog.showErrorBox(
      "Database Migration Failed",
      `SQLite database migration failed.\n\nDetail: ${migrationResult.message}\n\nThe application will now close.`
    );
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
    }
    app.quit();
    return;
  }

  updateSplashProgress("Starting local ERP application server...", 80);
  try {
    const port = parseInt(process.env.PORT || "3000", 10);
    const serverUrl = await startNextServer({
      rootDir: projectRootDir,
      port,
      appMode: "offline",
      databaseUrl: sqliteUrl,
    });

    updateSplashProgress("Opening School ERP...", 95);
    mainWindow = await createMainWindow(serverUrl);
    isBootstrapped = true;
    isBootstrapping = false;
    console.log("[Main] Portable desktop ERP startup pipeline completed successfully.");
  } catch (err: any) {
    isBootstrapping = false;
    console.error("[Main] Startup failed:", err);
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
    }
    dialog.showErrorBox("Startup Failed", `Failed to start SchoolERP application server:\n\n${err.message}`);
    app.quit();
  }
}

app.on("ready", bootstrapDesktopApp);

app.on("window-all-closed", () => {
  stopNextServer();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", async () => {
  if (mainWindow === null) {
    const port = parseInt(process.env.PORT || "3000", 10);
    mainWindow = await createMainWindow(`http://127.0.0.1:${port}`);
  }
});

process.on("will-quit", () => {
  stopNextServer();
  if (portableDbFilePath) {
    releaseSingleInstanceLock(portableDbFilePath);
  }
});
