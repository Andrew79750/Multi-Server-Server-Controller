const path      = require('path');
const fs        = require('fs');
const { spawn } = require('child_process');
const extractZip = require('extract-zip');

class InstallerController {
  constructor(win) {
    this.win  = win;
    this.opts = null;
  }

  // ── IPC emit helpers ────────────────────────────────────────────────────────
  progress(percent, message) {
    this.win.webContents.send('install:progress', { percent, message });
  }
  log(msg)  { this.win.webContents.send('install:log',      msg); }
  error(msg){ this.win.webContents.send('install:error',    msg); }
  complete(d){ this.win.webContents.send('install:complete', d);  }

  // ── app.zip location ────────────────────────────────────────────────────────
  get zipPath() {
    const { app } = require('electron');
    return app.isPackaged
      ? path.join(process.resourcesPath, 'app.zip')
      : path.join(__dirname, '..', 'resources', 'app.zip');
  }

  // ── Main entry point ────────────────────────────────────────────────────────
  async install(opts) {
    this.opts = opts;
    const { installPath } = opts;

    try {
      // 1 — Prepare folder
      this.progress(5, 'Preparing installation folder…');
      this.log('Creating installation directory…');
      fs.mkdirSync(installPath, { recursive: true });

      // 2 — Close running instance
      this.progress(10, 'Checking for running instances…');
      await this.killRunningApp();

      // 3 — Verify zip exists
      if (!fs.existsSync(this.zipPath)) {
        throw new Error(`Installer payload not found: ${this.zipPath}`);
      }

      // 4 — Extract
      this.progress(15, 'Extracting application files…');
      this.log(`Extracting to: ${installPath}`);
      await this.extract(installPath);

      // 5 — Desktop shortcut
      if (opts.desktopShortcut) {
        this.progress(78, 'Creating desktop shortcut…');
        this.log('Creating desktop shortcut…');
        const shortcuts = require('./shortcutManager');
        await shortcuts.createDesktopShortcut(installPath);
      }

      // 6 — Start Menu shortcut
      if (opts.startMenuShortcut) {
        this.progress(83, 'Creating Start Menu shortcut…');
        this.log('Creating Start Menu shortcut…');
        const shortcuts = require('./shortcutManager');
        await shortcuts.createStartMenuShortcut(installPath);
      }

      // 7 — Start with Windows
      if (opts.startWithWindows) {
        this.progress(88, 'Configuring startup entry…');
        this.log('Adding startup registry entry…');
        await this.setStartup(installPath, true);
      }

      // 8 — Uninstaller
      this.progress(92, 'Creating uninstaller…');
      this.log('Creating uninstaller…');
      const uninstall = require('./uninstallManager');
      await uninstall.create(installPath);

      // 9 — Done
      this.progress(100, 'Installation complete!');
      this.log('ESS Server Controller installed successfully.');
      this.complete({ installPath });

    } catch (err) {
      this.error(err.message || String(err));
      throw err;
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  killRunningApp() {
    return new Promise(resolve => {
      const p = spawn('taskkill', ['/F', '/IM', 'ESS Server Controller.exe', '/T'], {
        windowsHide: true,
        stdio: 'ignore',
      });
      p.on('close', resolve);
    });
  }

  async extract(installPath) {
    let current = 0;
    await extractZip(this.zipPath, {
      dir: installPath,
      onEntry: (entry, zipfile) => {
        current++;
        const pct = 15 + (current / Math.max(zipfile.entryCount, 1)) * 60;
        if (current % 20 === 0 || current === 1) {
          this.progress(Math.min(75, pct), `Extracting files… (${current}/${zipfile.entryCount})`);
        }
        const base = path.basename(entry.fileName);
        if (base.endsWith('.exe') || base.endsWith('.dll') || base === 'app.asar') {
          this.log(`  ✓ ${base}`);
        }
      },
    });
    this.log('All files extracted.');
  }

  setStartup(installPath, enable) {
    const exePath = path.join(installPath, 'ESS Server Controller.exe').replace(/'/g, "''");
    const script  = enable
      ? `Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -Name 'ESS Server Controller' -Value '"${exePath}"'`
      : `Remove-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -Name 'ESS Server Controller' -ErrorAction SilentlyContinue`;
    return this.ps(script);
  }

  ps(script) {
    return new Promise((resolve, reject) => {
      const p = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
        windowsHide: true,
        stdio: 'pipe',
      });
      let stderr = '';
      p.stderr.on('data', d => (stderr += d.toString()));
      p.on('close', code => (code === 0 ? resolve() : reject(new Error(stderr || `Exit ${code}`))));
    });
  }
}

module.exports = InstallerController;
