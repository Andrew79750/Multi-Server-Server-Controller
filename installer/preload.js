const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Window
  minimize:    () => ipcRenderer.invoke('window:minimize'),
  close:       () => ipcRenderer.invoke('window:close'),

  // Path helpers
  defaultPath:  ()  => ipcRenderer.invoke('installer:defaultPath'),
  browse:       ()  => ipcRenderer.invoke('installer:browse'),
  validatePath: (p) => ipcRenderer.invoke('installer:validatePath', p),

  // Install
  startInstall: (opts) => ipcRenderer.invoke('installer:start', opts),

  // Post-install
  launch:     (p) => ipcRenderer.invoke('installer:launch', p),
  openFolder: (p) => ipcRenderer.invoke('installer:openFolder', p),

  // Events from main → renderer
  onProgress: (cb) => ipcRenderer.on('install:progress', (_, d) => cb(d)),
  onLog:      (cb) => ipcRenderer.on('install:log',      (_, m) => cb(m)),
  onError:    (cb) => ipcRenderer.on('install:error',    (_, e) => cb(e)),
  onComplete: (cb) => ipcRenderer.on('install:complete', (_, d) => cb(d)),
});
