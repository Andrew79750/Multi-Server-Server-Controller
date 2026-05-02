const fs = require("fs");
const path = require("path");
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
const APP_LOGO = path.join(__dirname, "src", "assets", "logo.png");

app.commandLine.appendSwitch("disable-features", "Vulkan");
app.commandLine.appendSwitch("disable-gpu-sandbox");

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

function getAppState() {
  const config = configManager.get();
  return {
    appName: "ESS Server Controller",
    version: app.getVersion(),
    theme: config.theme,
    notificationTimeout: config.notificationTimeout,
    appUpdates: appUpdater.getState(),
    startWithWindows: app.getLoginItemSettings().openAtLogin,
    system: getSystemInfo(),
    servers: processManager.getServers(),
    github: githubUpdater.getState(),
    external: externalFiles.getState(),
    logs: logger.getLogs("all").slice(-120)
  };
}

function getInstallBasePath() {
  return app.isPackaged ? path.dirname(process.execPath) : __dirname;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 700,
    minWidth: 980,
    minHeight: 620,
    title: "ESS Server Controller",
    icon: APP_LOGO,
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

async function runStartupUpdateCheck() {
  const config = configManager.get().appUpdates;
  if (!config?.enabled || !config.checkOnStartup) return;
  const state = await appUpdater.checkLatest({ manual: false });
  if (state.error) {
    notify("warning", "Update check failed", state.error);
    return;
  }
  if (state.updateAvailable && config.notifyOnUpdate) {
    notify("info", `Update ${state.latestVersion} is available`, state.releaseName);
    send("updates:available", state);
  }
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
  ipcMain.handle("updates:get-state", () => appUpdater.getState());
  ipcMain.handle("updates:check", async () => {
    const state = await appUpdater.checkLatest({ manual: true });
    if (state.error) notify("warning", "Update check failed", state.error);
    else if (state.updateAvailable) {
      notify("info", `Update ${state.latestVersion} is available`, state.releaseName);
      send("updates:available", state);
    } else notify("success", "ESS Server Controller is up to date");
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

  appUpdater = new AppUpdater(configManager, logger, app.getVersion());
  appUpdater.init();

  externalFiles = new ExternalFiles(getInstallBasePath());
  externalFiles.init();

  logger.on("log", (entry) => send("log:new", entry));
  logger.on("cleared", () => send("logs:cleared"));
  processManager.on("state", (state) => send("server:state", state));
  githubUpdater.on("state", (state) => send("github:state", state));
  appUpdater.on("state", (state) => send("updates:state", state));

  registerIpc();
  createWindow();
  logger.info("app", "ESS Server Controller started");
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
