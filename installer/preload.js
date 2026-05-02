const { contextBridge, ipcRenderer } = require('electron');

const windowControls = {
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowClose: () => ipcRenderer.invoke('window:close'),
  windowToggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize'),
  windowIsMaximized: () => ipcRenderer.invoke('window:isMaximized'),
};

contextBridge.exposeInMainWorld('api', {
  // Window
  minimize: windowControls.windowMinimize,
  close: windowControls.windowClose,
  toggleMaximize: windowControls.windowToggleMaximize,
  isMaximized: windowControls.windowIsMaximized,

  // Path helpers
  defaultPath: () => ipcRenderer.invoke('installer:defaultPath'),
  browse: () => ipcRenderer.invoke('installer:browse'),
  validatePath: (p) => ipcRenderer.invoke('installer:validatePath', p),
  installedInfo: (p) => ipcRenderer.invoke('installer:installedInfo', p),
  checkUpdates: (version) => ipcRenderer.invoke('installer:checkUpdates', version),

  // Install
  startInstall: (opts) => ipcRenderer.invoke('installer:start', opts),
  startRepair: (opts) => ipcRenderer.invoke('repair:start', opts),

  // Uninstall
  uninstallInfo: (p) => ipcRenderer.invoke('uninstall:info', p),
  startUninstall: (opts) => ipcRenderer.invoke('uninstall:start', opts),
  closeAfterUninstall: () => ipcRenderer.invoke('uninstall:close'),

  // Post-install
  launch: (p) => ipcRenderer.invoke('installer:launch', p),
  openFolder: (p) => ipcRenderer.invoke('installer:openFolder', p),

  // Events from main to renderer
  onProgress: (cb) => ipcRenderer.on('install:progress', (_, d) => cb(d)),
  onLog: (cb) => ipcRenderer.on('install:log', (_, m) => cb(m)),
  onError: (cb) => ipcRenderer.on('install:error', (_, e) => cb(e)),
  onComplete: (cb) => ipcRenderer.on('install:complete', (_, d) => cb(d)),
  onRepairProgress: (cb) => ipcRenderer.on('repair:progress', (_, d) => cb(d)),
  onRepairLog: (cb) => ipcRenderer.on('repair:log', (_, m) => cb(m)),
  onRepairError: (cb) => ipcRenderer.on('repair:error', (_, e) => cb(e)),
  onRepairComplete: (cb) => ipcRenderer.on('repair:complete', (_, d) => cb(d)),
  onUninstallProgress: (cb) => ipcRenderer.on('uninstall:progress', (_, d) => cb(d)),
  onUninstallLog: (cb) => ipcRenderer.on('uninstall:log', (_, m) => cb(m)),
  onUninstallError: (cb) => ipcRenderer.on('uninstall:error', (_, e) => cb(e)),
  onUninstallComplete: (cb) => ipcRenderer.on('uninstall:complete', (_, d) => cb(d)),
});

contextBridge.exposeInMainWorld('installerApi', windowControls);
