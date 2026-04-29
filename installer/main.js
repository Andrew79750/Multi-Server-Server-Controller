const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const os   = require('os');

let mainWindow = null;
let controller = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width:     900,
    height:    580,
    minWidth:  900,
    minHeight: 580,
    maxWidth:  900,
    maxHeight: 580,
    frame:     false,
    resizable: false,
    center:    true,
    show:      false,
    backgroundColor: '#0d1117',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.webContents.once('did-finish-load', () => {
    const InstallerController = require('./backend/installerController');
    controller = new InstallerController(mainWindow);
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

// ── Window controls ───────────────────────────────────────────────────────────
ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:close',    () => app.quit());

// ── Install-path helpers ──────────────────────────────────────────────────────
ipcMain.handle('installer:defaultPath', () =>
  path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'ESS-Multi-Server-Manager')
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

// ── Install ───────────────────────────────────────────────────────────────────
ipcMain.handle('installer:start', async (_, opts) => {
  try {
    await controller.install(opts);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

// ── Post-install actions ──────────────────────────────────────────────────────
ipcMain.handle('installer:launch', (_, installPath) => {
  shell.openPath(path.join(installPath, 'ESS Server Controller.exe'));
});

ipcMain.handle('installer:openFolder', (_, installPath) => {
  shell.openPath(installPath);
});
