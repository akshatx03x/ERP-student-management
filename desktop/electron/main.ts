import { app, BrowserWindow, dialog, session } from "electron";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { registerIpcHandlers } from "./ipc";
import { ensureLocalPostgresRunning, stopEmbeddedPostgres } from "./postgres-manager";
import { runPendingPrismaMigrations } from "./migration-runner";
import { startNextServer, stopNextServer } from "./next-server-manager";
import { ensureWritableDirectoriesExist } from "./paths";

// Force Chromium to never use a system proxy for loopback addresses.
// Without this, WinINET proxy resolution hangs Chromium on Windows before
// any TCP connection is made to 127.0.0.1, causing loadURL to stall forever.
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

  // Force direct proxy: bypasses WinINET/WPAD proxy resolution which hangs Chromium
  // on loopback (127.0.0.1) connections in Electron on Windows.
  console.log(`[MainWindow] Setting session proxy to direct://...`);
  await session.defaultSession.setProxy({ proxyRules: "direct://" });
  console.log(`[MainWindow] Session proxy set to direct://`);
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

  // Instrument Window Events
  window.once("ready-to-show", () => {
    console.log("[MainWindow Event] ready-to-show fired!");
    console.log("[MainWindow] Displaying main window and destroying splash screen...");
    window.show();
    window.focus();
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
  });

  window.on("show", () => console.log("[MainWindow Event] show"));
  window.on("focus", () => console.log("[MainWindow Event] focus"));
  window.on("blur", () => console.log("[MainWindow Event] blur"));
  window.on("close", () => console.log("[MainWindow Event] close"));
  window.on("closed", () => {
    console.log("[MainWindow Event] closed");
    mainWindow = null;
  });
  window.on("unresponsive", () => console.warn("[MainWindow Event] unresponsive"));
  window.on("responsive", () => console.log("[MainWindow Event] responsive"));

  // Instrument ALL WebContents Events
  const wc = window.webContents;

  wc.on("did-start-loading", () => console.log("[WebContents Event] did-start-loading"));
  wc.on("did-stop-loading", () => console.log("[WebContents Event] did-stop-loading"));
  wc.on("did-start-navigation", (_evt, url, isInPlace, isMainFrame) => {
    console.log(`[WebContents Event] did-start-navigation - URL: ${url}, isInPlace: ${isInPlace}, isMainFrame: ${isMainFrame}`);
  });
  wc.on("did-redirect-navigation", (_evt, url, _responseCode, isMainFrame) => {
    console.log(`[WebContents Event] did-redirect-navigation - Target URL: ${url}, isMainFrame: ${isMainFrame}`);
  });
  wc.on("did-frame-finish-load", (_evt, isMainFrame) => {
    console.log(`[WebContents Event] did-frame-finish-load - isMainFrame: ${isMainFrame}`);
  });
  wc.on("dom-ready", () => console.log("[WebContents Event] dom-ready"));
  wc.on("did-finish-load", () => console.log("[WebContents Event] did-finish-load"));
  wc.on("did-fail-load", (_evt, errorCode, errorDescription, validatedURL, isMainFrame) => {
    console.error(
      `[WebContents Event] did-fail-load - Code: ${errorCode}, Description: ${errorDescription}, URL: ${validatedURL}, isMainFrame: ${isMainFrame}`
    );
  });
  wc.on("render-process-gone", (_evt, details) => {
    console.error(
      `[WebContents Event] render-process-gone - Reason: ${details.reason}, Exit Code: ${details.exitCode}`
    );
  });

  // Diagnostic timer to dump webContents state if loadURL takes long
  const diagnosticTimer = setInterval(() => {
    if (window && !window.isDestroyed()) {
      const navHistory = wc.navigationHistory;
      console.log(`[MainWindow Diagnostic Dump] isLoading: ${wc.isLoading()}, getURL: "${wc.getURL()}", canGoBack: ${navHistory.canGoBack()}, canGoForward: ${navHistory.canGoForward()}`);
    } else {
      clearInterval(diagnosticTimer);
    }
  }, 3000);

  console.log(`[MainWindow] Initiating loadURL(${serverUrl})...`);
  try {
    await window.loadURL(serverUrl);
    console.log(`[MainWindow] loadURL(${serverUrl}) resolved successfully.`);
  } catch (err: any) {
    console.error(`[MainWindow] loadURL(${serverUrl}) failed with error:`, err);
    clearInterval(diagnosticTimer);
    throw err;
  } finally {
    clearInterval(diagnosticTimer);
  }

  // Safety fallback: Ensure window is shown and splash closed if ready-to-show fired during loadURL
  if (!window.isVisible()) {
    console.log(
      "[MainWindow] Window was not visible after loadURL resolved. Explicitly showing main window and destroying splash."
    );
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
    console.warn(
      "[Main] bootstrapDesktopApp() invoked while already bootstrapping/bootstrapped. Skipping duplicate execution."
    );
    return;
  }
  isBootstrapping = true;

  console.log("=========================================");
  console.log(" Starting SchoolERP Desktop Application ");
  console.log(" Mode: Offline Desktop Edition           ");
  console.log("=========================================");

  splashWindow = createSplashWindow();
  updateSplashProgress("Initializing application environment...", 10);

  const writablePaths = ensureWritableDirectoriesExist();
  process.env.OFFLINE_DATA_DIR = writablePaths.userDataDir;
  process.env.OFFLINE_UPLOAD_DIR = writablePaths.uploadsDir;
  process.env.OFFLINE_BACKUP_DIR = writablePaths.backupsDir;
  process.env.OFFLINE_STORAGE_DIR = writablePaths.storageDir;
  process.env.OFFLINE_LOG_DIR = writablePaths.logsDir;
  process.env.OFFLINE_TEMP_DIR = writablePaths.tempDir;

  const projectRootDir = findProjectRootDir(__dirname);

  // Load environment configuration from project root .env
  dotenv.config({ path: path.join(projectRootDir, ".env") });

  // Force offline mode environment for desktop wrapper
  process.env.APP_MODE = "offline";
  process.env.BETTER_AUTH_URL = "http://127.0.0.1:3000";
  process.env.NEXT_PUBLIC_APP_URL = "http://127.0.0.1:3000";
  const localDbUrl =
    process.env.DATABASE_URL_LOCAL && process.env.DATABASE_URL_LOCAL.trim() !== ""
      ? process.env.DATABASE_URL_LOCAL.trim()
      : process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("supabase.com")
      ? process.env.DATABASE_URL.trim()
      : "postgresql://postgres:postgres@127.0.0.1:5432/school_erp_offline";

  process.env.DATABASE_URL = localDbUrl;
  process.env.DATABASE_URL_LOCAL = localDbUrl;
  process.env.DIRECT_URL = localDbUrl;

  updateSplashProgress("Registering system services...", 25);
  registerIpcHandlers();

  updateSplashProgress("Verifying local PostgreSQL service...", 40);
  const pgStatus = await ensureLocalPostgresRunning();
  if (!pgStatus.ready) {
    updateSplashProgress("PostgreSQL connection error!", 40);
    dialog.showErrorBox(
      "Local PostgreSQL Unavailable",
      `Could not connect to local PostgreSQL database server.\n\nDetail: ${pgStatus.message}\n\nPlease ensure PostgreSQL service is installed and running.`
    );
  }

  updateSplashProgress("Applying database migrations...", 60);
  const migrationResult = await runPendingPrismaMigrations(projectRootDir, localDbUrl);
  if (!migrationResult.success) {
    console.warn("[Main] Database migration notice:", migrationResult.message);
  }

  updateSplashProgress("Starting local ERP server...", 80);
  try {
    const port = parseInt(process.env.PORT || "3000", 10);
    const serverUrl = await startNextServer({
      rootDir: projectRootDir,
      port,
      appMode: "offline",
      databaseUrl: localDbUrl,
    });

    updateSplashProgress("Opening School ERP...", 95);
    mainWindow = await createMainWindow(serverUrl);
    isBootstrapped = true;
    isBootstrapping = false;
    console.log("[Main] Desktop application startup pipeline completed successfully.");
  } catch (err: any) {
    isBootstrapping = false;
    console.error("[Main] Desktop application startup failed:", err);
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
  stopEmbeddedPostgres();
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
  stopEmbeddedPostgres();
});
