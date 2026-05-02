const fs = require("fs");
const path = require("path");
const dns = require("dns").promises;
const { app, BrowserWindow, ipcMain, shell, dialog, Menu } = require("electron");
const ConfigManager = require("./backend/configManager");
const Logger = require("./backend/logger");
const ProcessManager = require("./backend/processManager");
const GitHubUpdater = require("./backend/githubUpdater");
const AppUpdater = require("./backend/appUpdater");
const ExternalFiles = require("./backend/externalFiles");
const { getSystemInfo } = require("./backend/systemInfo");

let mainWindow = null;
let configManager = null;
let logger = null;
let processManager = null;
let githubUpdater = null;
let appUpdater = null;
let externalFiles = null;
let appStateTimer = null;
let connectivityTimer = null;
let connectivity = {
  online: true,
  lastConnectedAt: null,
  checkedAt: null
};
const notifiedUpdateKeys = new Set();
const APP_LOGO = path.join(__dirname, "src", "assets", "logo.png");

app.commandLine.appendSwitch("disable-features", "Vulkan");
app.commandLine.appendSwitch("disable-gpu-sandbox");

function normalizeVersion(value) {
  return String(value || "").trim().replace(/^v/i, "");
}

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function notify(type, message, details = "") {
  send("notification:new", {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type,
    message,
    details,
    timestamp: new Date().toISOString()
  });
}

function announceUpdateAvailable(state, { force = false } = {}) {
  if (!state?.updateAvailable || state.checking) return;
  const config = configManager?.get().appUpdates || {};
  if (!force && config.notifyOnUpdate === false) return;
  const key = `${state.latestVersion || "unknown"}:${state.lastChecked || Date.now()}`;
  if (notifiedUpdateKeys.has(key)) return;
  notifiedUpdateKeys.add(key);
  notify("info", "Update Detected", `Version ${state.latestVersion} is available`);
  send("updates:available", state);
}

function getAppState() {
  const config = configManager.get();
  return {
    appName: "ESS Server Controller",
    version: getRuntimeVersion(),
    theme: config.theme,
    notificationTimeout: config.notificationTimeout,
    connectivity,
    appUpdates: appUpdater.getState(),
    startWithWindows: app.getLoginItemSettings().openAtLogin,
    system: getSystemInfo(),
    servers: processManager.getServers(),
    github: githubUpdater.getState(),
    external: externalFiles.getState(),
    logs: logger.getLogs("all").slice(-120)
  };
}

async function checkConnectivity() {
  const checkedAt = new Date().toISOString();
  try {
    await Promise.race([
      dns.lookup("github.com"),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Connectivity check timed out")), 4500))
    ]);
    connectivity = {
      online: true,
      lastConnectedAt: checkedAt,
      checkedAt
    };
  } catch {
    connectivity = {
      ...connectivity,
      online: false,
      checkedAt
    };
  }
  send("app:state", getAppState());
  return connectivity;
}

function getInstallBasePath() {
  return app.isPackaged ? path.dirname(process.execPath) : __dirname;
}

function getInstalledReleaseVersion() {
  const candidates = [
    path.join(getInstallBasePath(), "installed-version.json"),
    path.join(path.dirname(process.execPath), "installed-version.json")
  ];

  for (const filePath of candidates) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const metadata = JSON.parse(fs.readFileSync(filePath, "utf8"));
      const version = normalizeVersion(metadata.version || metadata.tagName);
      if (version) return version;
    } catch {
      // Ignore stale or malformed metadata and fall back to the packaged version.
    }
  }

  return "";
}

function getRuntimeVersion() {
  return getInstalledReleaseVersion() || normalizeVersion(app.getVersion()) || "0.0.0";
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 730,
    minWidth: 1280,
    minHeight: 730,
    title: "ESS Server Controller",
    icon: APP_LOGO,
    frame: false,
    titleBarStyle: "hidden",
    backgroundColor: "#070b14",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, "src", "index.html"));
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.webContents.once("did-finish-load", () => {
    setTimeout(() => runStartupUpdateCheck(), 4500);
  });
}

function getWindowFromEvent(event) {
  return BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow() || mainWindow;
}

ipcMain.handle("window:minimize", (event) => getWindowFromEvent(event)?.minimize());
ipcMain.handle("window:close", (event) => getWindowFromEvent(event)?.close());
ipcMain.handle("window:toggle-maximize", (event) => {
  const win = getWindowFromEvent(event);
  if (!win || !win.isResizable()) return false;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
  return win.isMaximized();
});
ipcMain.handle("window:is-maximized", (event) => Boolean(getWindowFromEvent(event)?.isMaximized()));

async function runStartupUpdateCheck() {
  const config = configManager.get().appUpdates;
  if (!config?.enabled || !config.checkOnStartup) return;
  const state = await appUpdater.checkLatest({ manual: false });
  if (state.error) {
    notify("warning", "Update check failed", state.error);
    return;
  }
  if (config.notifyOnUpdate) announceUpdateAvailable(state);
}

function createDesktopShortcut() {
  if (process.platform !== "win32") throw new Error("Desktop shortcuts are only supported on Windows.");
  const shortcutPath = path.join(app.getPath("desktop"), "ESS Server Controller.lnk");
  const target = app.isPackaged ? process.execPath : process.execPath;
  const args = app.isPackaged ? "" : `"${path.join(__dirname, "main.js")}"`;
  const success = shell.writeShortcutLink(shortcutPath, {
    target,
    args,
    cwd: app.isPackaged ? path.dirname(process.execPath) : __dirname,
    icon: app.isPackaged ? process.execPath : APP_LOGO,
    iconIndex: 0,
    description: "ESS Server Controller"
  });
  if (!success || !fs.existsSync(shortcutPath)) throw new Error("Windows did not create the desktop shortcut.");
  return shortcutPath;
}

function registerIpc() {
  ipcMain.handle("app:get-state", () => getAppState());
  ipcMain.handle("app:create-desktop-shortcut", () => {
    const shortcutPath = createDesktopShortcut();
    logger.info("app", "Desktop shortcut created", shortcutPath);
    notify("success", "Desktop shortcut created");
    return shortcutPath;
  });
  ipcMain.handle("app:open-install-folder", async () => {
    const folder = getInstallBasePath();
    await shell.openPath(folder);
    return folder;
  });
  ipcMain.handle("external:get", () => externalFiles.getState());
  ipcMain.handle("external:open-root", async () => {
    const state = externalFiles.getState();
    await shell.openPath(state.rootPath);
    return state.rootPath;
  });
  ipcMain.handle("app:set-start-with-windows", (_event, enabled) => {
    app.setLoginItemSettings({
      openAtLogin: Boolean(enabled),
      path: process.execPath
    });
    const active = app.getLoginItemSettings().openAtLogin;
    logger.info("app", active ? "Start with Windows enabled" : "Start with Windows disabled");
    send("app:state", getAppState());
    return active;
  });
  ipcMain.handle("servers:get", () => processManager.getServers());
  ipcMain.handle("servers:start", async (_event, id) => {
    const result = await processManager.startServer(id);
    notify("success", `${result.name} start requested`);
    return result;
  });
  ipcMain.handle("servers:stop", async (_event, id) => {
    const result = await processManager.stopServer(id);
    notify("info", `${result.name} stop requested`);
    return result;
  });
  ipcMain.handle("servers:restart", async (_event, id) => {
    const result = await processManager.restartServer(id);
    notify("success", `${result.name} restart requested`);
    return result;
  });
  ipcMain.handle("github:get", () => githubUpdater.getState());
  ipcMain.handle("github:check-now", async () => {
    const state = await githubUpdater.scanDueRepos(true);
    notify("info", "GitHub check completed");
    return state;
  });
  ipcMain.handle("github:pull", async (_event, id) => {
    const result = await githubUpdater.pullRepo(id, false);
    notify("success", `${result.name} pulled`);
    return githubUpdater.getState();
  });
  ipcMain.handle("github:set-enabled", (_event, id, enabled) => githubUpdater.setEnabled(id, enabled));
  ipcMain.handle("github:add-repo", async (_event, repoPath) => {
    let selected = repoPath;
    if (!selected) {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: "Add Git repository",
        properties: ["openDirectory"]
      });
      if (result.canceled || !result.filePaths[0]) return githubUpdater.getState();
      selected = result.filePaths[0];
    }
    return githubUpdater.addRepo(selected);
  });
  ipcMain.handle("github:remove-repo", (_event, id) => githubUpdater.removeRepo(id));
  ipcMain.handle("logs:get", (_event, filter) => logger.getLogs(filter));
  ipcMain.handle("logs:clear", () => {
    logger.clear();
    notify("info", "Logs cleared");
    return [];
  });
  ipcMain.handle("settings:save", (_event, settings) => {
    const saved = configManager.patch(settings);
    appUpdater.configureTimer();
    notify("success", "Settings saved");
    send("app:state", getAppState());
    return saved;
  });
  ipcMain.handle("theme:set", (_event, theme) => {
    const saved = configManager.patch({ theme });
    send("app:state", getAppState());
    return saved.theme;
  });
  ipcMain.handle("folder:open", async (_event, folderPath) => {
    await processManager.openFolder(folderPath);
    return true;
  });
  ipcMain.handle("dialog:select-server-root", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Select server root folder",
      properties: ["openDirectory"]
    });
    return result.canceled ? "" : result.filePaths[0] || "";
  });
  ipcMain.handle("dialog:select-server-launch-file", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Select launch executable or batch file",
      properties: ["openFile"],
      filters: [
        { name: "Launch files", extensions: ["exe", "bat", "cmd"] },
        { name: "Executables", extensions: ["exe"] },
        { name: "Batch files", extensions: ["bat", "cmd"] },
        { name: "All files", extensions: ["*"] }
      ]
    });
    return result.canceled ? "" : result.filePaths[0] || "";
  });
  ipcMain.handle("updates:get-state", () => appUpdater.getState());
  ipcMain.handle("updates:check", async () => {
    const state = await appUpdater.checkLatest({ manual: true });
    if (state.error) notify("warning", "Update check failed", state.error);
    else if (state.updateAvailable) announceUpdateAvailable(state, { force: true });
    else notify("success", "ESS Server Controller is up to date");
    return state;
  });
  ipcMain.handle("updates:skip-version", (_event, version) => appUpdater.skipVersion(version));
  ipcMain.handle("shell:open-external", async (_event, url) => {
    if (!/^https?:\/\//i.test(String(url || ""))) throw new Error("Only http/https links can be opened.");
    await shell.openExternal(url);
    notify("info", "Opening link in browser");
    return true;
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);

  configManager = new ConfigManager(app.getPath("appData"));
  configManager.init();

  logger = new Logger(app.getPath("appData"));
  logger.init();

  processManager = new ProcessManager(configManager, logger, shell);
  processManager.init();

  githubUpdater = new GitHubUpdater(configManager, logger);
  githubUpdater.init();

  appUpdater = new AppUpdater(configManager, logger, getRuntimeVersion());
  appUpdater.init();

  externalFiles = new ExternalFiles(getInstallBasePath());
  externalFiles.init();

  logger.on("log", (entry) => send("log:new", entry));
  logger.on("cleared", () => send("logs:cleared"));
  processManager.on("state", (state) => send("server:state", state));
  githubUpdater.on("state", (state) => send("github:state", state));
  appUpdater.on("state", (state) => {
    send("updates:state", state);
    announceUpdateAvailable(state);
  });

  registerIpc();
  createWindow();
  checkConnectivity();
  connectivityTimer = setInterval(checkConnectivity, 10000);
  connectivityTimer.unref?.();
  appStateTimer = setInterval(() => send("app:state", getAppState()), 1500);
  appStateTimer.unref?.();
  logger.info("app", "ESS Server Controller started");
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
