import { app, BrowserWindow, dialog, session } from "electron";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { registerIpcHandlers } from "./ipc";
import { checkSqliteDatabaseIntegrity } from "./sqlite-manager";
import { runPendingPrismaMigrations } from "./migration-runner";
import { startNextServer, stopNextServer } from "./next-server-manager";
import { ensureWritableDirectoriesExist, getOrCreateDesktopAuthSecret, getPortableBaseDirectory } from "./paths";

app.commandLine.appendSwitch("proxy-bypass-list", "<-loopback>,localhost,127.0.0.1");
app.commandLine.appendSwitch("proxy-server", "direct://");
app.commandLine.appendSwitch("no-proxy-server");

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;

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

let isBootstrapping = false;
let isBootstrapped = false;

async function bootstrapDesktopApp(): Promise<void> {
  if (isBootstrapping || isBootstrapped) {
    return;
  }
  isBootstrapping = true;

  console.log("=========================================");
  console.log(" Starting SchoolERP Portable Desktop ERP ");
  console.log(" Mode: Single-User Portable SQLite      ");
  console.log("=========================================");

  splashWindow = createSplashWindow();
  updateSplashProgress("Initializing portable environment...", 10);

  const writablePaths = ensureWritableDirectoriesExist();
  process.env.OFFLINE_DATA_DIR = writablePaths.baseDataDir;
  process.env.OFFLINE_UPLOAD_DIR = writablePaths.uploadsDir;
  process.env.OFFLINE_BACKUP_DIR = writablePaths.backupsDir;
  process.env.OFFLINE_STORAGE_DIR = writablePaths.storageDir;
  process.env.OFFLINE_LOG_DIR = writablePaths.logsDir;
  process.env.OFFLINE_TEMP_DIR = writablePaths.tempDir;

  const projectRootDir = findProjectRootDir(__dirname);

  const candidateEnvPaths = [
    path.join(process.resourcesPath, ".env"),
    path.join(writablePaths.configDir, ".env"),
    path.join(projectRootDir, ".env"),
  ];

  for (const envPath of candidateEnvPaths) {
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
      console.log(`[Main] Loaded environment from: ${envPath}`);
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

  updateSplashProgress("Registering application IPC services...", 25);
  registerIpcHandlers();

  const isFirstRun = !fs.existsSync(writablePaths.dbFilePath) || fs.statSync(writablePaths.dbFilePath).size === 0;

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

  const sqliteUrl = `file:${writablePaths.dbFilePath}`;
  process.env.DATABASE_URL = sqliteUrl;

  console.log(`[Main Environment Summary]
  APP_MODE: ${process.env.APP_MODE}
  Portable Base Directory: ${writablePaths.baseDataDir}
  SQLite DB File: ${writablePaths.dbFilePath}
  Is First Run: ${isFirstRun}`);

  updateSplashProgress("Applying SQLite database migrations...", 60);
  const migrationResult = await runPendingPrismaMigrations(projectRootDir, sqliteUrl, {
    isFirstRun,
    backupsDir: writablePaths.backupsDir,
  });
  if (!migrationResult.success) {
    console.warn("[Main] Database migration notice:", migrationResult.message);
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
});
