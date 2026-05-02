const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const os   = require('os');
const { spawn } = require('child_process');

let mainWindow = null;
let controller = null;
const APP_LOGO = path.join(__dirname, 'assets', 'logo.png');
let selfDeleteAfterQuit = false;

app.commandLine.appendSwitch('disable-features', 'Vulkan');
app.commandLine.appendSwitch('disable-gpu-sandbox');

function defaultInstallPath() {
  return path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'ESS-Multi-Server-Manager');
}

function scheduleSelfDeleteIfPackaged() {
  if (!app.isPackaged || process.env.ESS_DISABLE_SELF_DELETE === '1') return false;

  const exePath = process.execPath;
  const exe = exePath.replace(/'/g, "''");
  const dir = path.dirname(exePath).replace(/'/g, "''");
  const script = `
Start-Sleep -Seconds 2
Remove-Item -LiteralPath '${exe}' -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath '${dir}' -Force -ErrorAction SilentlyContinue
`.trim();

  const child = spawn('powershell', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script], {
    detached: true,
    windowsHide: true,
    stdio: 'ignore',
  });
  child.unref();
  return true;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width:     900,
    height:    580,
    minWidth:  900,
    minHeight: 580,
    maxWidth:  900,
    maxHeight: 580,
    frame:     false,
    titleBarStyle: 'hidden',
    resizable: false,
    center:    true,
    show:      false,
    backgroundColor: '#070b14',
    hasShadow: true,
    icon: APP_LOGO,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          false,
    },
  });

  const InstallerController = require('./backend/installerController');
  controller = new InstallerController(mainWindow);

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
  if (selfDeleteAfterQuit) scheduleSelfDeleteIfPackaged();
});

// ── Window controls ───────────────────────────────────────────────────────────
function getInstallerWindow(event) {
  return BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow() || mainWindow;
}

ipcMain.handle('window:minimize', (event) => getInstallerWindow(event)?.minimize());
ipcMain.handle('window:close',    (event) => getInstallerWindow(event)?.close());
ipcMain.handle('window:toggleMaximize', (event) => {
  const win = getInstallerWindow(event);
  if (!win || !win.isResizable()) return false;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
  return win.isMaximized();
});
ipcMain.handle('window:isMaximized', (event) => Boolean(getInstallerWindow(event)?.isMaximized()));

// ── Install-path helpers ──────────────────────────────────────────────────────
ipcMain.handle('installer:defaultPath', () =>
  defaultInstallPath()
);

ipcMain.handle('installer:browse', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title:       'Choose Installation Folder',
    properties:  ['openDirectory', 'createDirectory'],
    defaultPath: path.join(os.homedir(), 'AppData', 'Local', 'Programs'),
  });
  if (result.canceled || !result.filePaths.length) return null;
  let chosen = result.filePaths[0];
  if (!chosen.toLowerCase().endsWith('ess-multi-server-manager')) {
    chosen = path.join(chosen, 'ESS-Multi-Server-Manager');
  }
  return chosen;
});

ipcMain.handle('installer:validatePath', (_, p) => {
  if (!p || !p.trim()) return { ok: false, error: 'Path cannot be empty.' };
  if (p.length > 220)   return { ok: false, error: 'Path is too long.' };
  // Basic safety: must be an absolute path
  if (!path.isAbsolute(p)) return { ok: false, error: 'Path must be absolute.' };
  return { ok: true };
});

ipcMain.handle('installer:installedInfo', (_, installPath) => {
  if (!controller) return { installed: false, version: '', installPath };
  return controller.getInstalledInfo(installPath);
});

ipcMain.handle('installer:checkUpdates', async (_, currentVersion) => {
  if (!controller) throw new Error('Installer is still starting. Please try again.');
  return controller.checkForUpdates(currentVersion);
});

// ── Install ───────────────────────────────────────────────────────────────────
ipcMain.handle('installer:start', async (_, opts) => {
  try {
    await controller.install(opts);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('repair:start', async (_, opts = {}) => {
  try {
    await controller.repair(opts);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

// Uninstall
ipcMain.handle('uninstall:info', async (_, installPath) => {
  const uninstallManager = require('./backend/uninstallManager');
  return uninstallManager.getInstalledInfo(installPath || defaultInstallPath());
});

ipcMain.handle('uninstall:start', async (_, opts = {}) => {
  const uninstallManager = require('./backend/uninstallManager');
  try {
    await uninstallManager.uninstall(opts, {
      progress: (percent, message) => mainWindow?.webContents.send('uninstall:progress', { percent, message }),
      log: message => mainWindow?.webContents.send('uninstall:log', message),
      complete: details => mainWindow?.webContents.send('uninstall:complete', details),
    });
    selfDeleteAfterQuit = true;
    return { ok: true };
  } catch (err) {
    const message = err.message || String(err);
    mainWindow?.webContents.send('uninstall:error', message);
    return { ok: false, error: message };
  }
});

ipcMain.handle('uninstall:close', () => {
  selfDeleteAfterQuit = true;
  app.quit();
});

// ── Post-install actions ──────────────────────────────────────────────────────
ipcMain.handle('installer:launch', (_, installPath) => {
  shell.openPath(path.join(installPath, 'ESS Server Controller.exe'));
});

ipcMain.handle('installer:openFolder', (_, installPath) => {
  shell.openPath(installPath);
});
