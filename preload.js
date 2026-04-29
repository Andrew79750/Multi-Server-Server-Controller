const { contextBridge, ipcRenderer } = require("electron");

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);
const on = (channel, callback) => {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld("essApi", {
  getAppState: () => invoke("app:get-state"),
  createDesktopShortcut: () => invoke("app:create-desktop-shortcut"),
  openInstallFolder: () => invoke("app:open-install-folder"),
  getExternalFiles: () => invoke("external:get"),
  openExternalRoot: () => invoke("external:open-root"),
  setStartWithWindows: (enabled) => invoke("app:set-start-with-windows", enabled),
  getServers: () => invoke("servers:get"),
  startServer: (id) => invoke("servers:start", id),
  stopServer: (id) => invoke("servers:stop", id),
  restartServer: (id) => invoke("servers:restart", id),
  getGithubRepos: () => invoke("github:get"),
  githubCheckNow: () => invoke("github:check-now"),
  githubPullRepo: (id) => invoke("github:pull", id),
  githubSetEnabled: (id, enabled) => invoke("github:set-enabled", id, enabled),
  githubAddRepo: (repoPath) => invoke("github:add-repo", repoPath),
  githubRemoveRepo: (id) => invoke("github:remove-repo", id),
  getLogs: (filter) => invoke("logs:get", filter),
  clearLogs: () => invoke("logs:clear"),
  checkForAppUpdate: () => invoke("updates:check"),
  getUpdateState: () => invoke("updates:get-state"),
  skipUpdateVersion: (version) => invoke("updates:skip-version", version),
  openExternal: (url) => invoke("shell:open-external", url),
  saveSettings: (settings) => invoke("settings:save", settings),
  setTheme: (theme) => invoke("theme:set", theme),
  openFolder: (folderPath) => invoke("folder:open", folderPath),
  onLog: (callback) => on("log:new", callback),
  onNotification: (callback) => on("notification:new", callback),
  onGithubState: (callback) => on("github:state", callback),
  onUpdateState: (callback) => on("updates:state", callback),
  onUpdateAvailable: (callback) => on("updates:available", callback),
  onServerState: (callback) => on("server:state", callback),
  onAppState: (callback) => on("app:state", callback),
  onLogsCleared: (callback) => on("logs:cleared", callback)
});
