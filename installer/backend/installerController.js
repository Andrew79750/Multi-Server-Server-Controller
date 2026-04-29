const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const extractZip = require('extract-zip');

const APP_NAME = 'ESS Server Controller';
const EXTERNAL_FOLDERS = ['scripts', 'configs', 'data', 'logs'];

class InstallerController {
  constructor(win) {
    this.win = win;
    this.opts = null;
  }

  progress(percent, message) {
    this.win.webContents.send('install:progress', { percent, message });
  }

  log(message) {
    this.win.webContents.send('install:log', message);
  }

  error(message) {
    this.win.webContents.send('install:error', message);
  }

  complete(details) {
    this.win.webContents.send('install:complete', details);
  }

  async install(opts) {
    this.opts = opts;
    const { installPath } = opts;
    const payloadZip = this.getBundledPayloadPath();

    try {
      this.progress(5, 'Preparing installation folder...');
      this.log('Creating installation directory...');
      fs.mkdirSync(installPath, { recursive: true });

      this.progress(10, 'Closing any running instances...');
      await this.killRunningApp();
      await this.sleep(1800);

      this.progress(12, 'Loading bundled Server Manager payload...');
      if (!fs.existsSync(payloadZip)) {
        throw new Error(
          `Bundled payload was not found.\nExpected: ${payloadZip}\nRun "npm run build:full" to rebuild the installer.`
        );
      }
      this.log(`Using bundled payload: ${payloadZip}`);

      this.progress(72, 'Extracting Server Manager files...');
      await this.extractPayload(payloadZip, installPath);

      this.progress(76, 'Creating runtime folders...');
      const externalRoot = this.createExternalFolders(installPath);
      this.log(`Install root: ${externalRoot}`);

      if (opts.desktopShortcut) {
        this.progress(80, 'Creating desktop shortcut...');
        this.log('Creating desktop shortcut...');
        await require('./shortcutManager').createDesktopShortcut(installPath);
      } else {
        await this.removeDesktopShortcut();
      }

      if (opts.startMenuShortcut) {
        this.progress(84, 'Creating Start Menu shortcut...');
        this.log('Creating Start Menu shortcut...');
        await require('./shortcutManager').createStartMenuShortcut(installPath);
      } else {
        await this.removeStartMenuShortcut();
      }

      this.progress(88, 'Configuring startup entry...');
      await this.setStartup(installPath, Boolean(opts.startWithWindows));

      this.progress(92, 'Registering uninstaller...');
      this.log('Writing custom uninstaller registration...');
      await require('./uninstallManager').create(installPath);

      this.progress(100, 'Installation complete!');
      this.log('ESS Server Controller installed successfully.');
      this.complete({ installPath, externalRoot });
    } catch (err) {
      this.error(err.message || String(err));
      throw err;
    }
  }

  getBundledPayloadPath() {
    return path.join(__dirname, '..', 'resources', 'payload.zip');
  }

  async extractPayload(zipPath, installPath) {
    let current = 0;
    await extractZip(zipPath, {
      dir: installPath,
      onEntry: (entry, zipfile) => {
        current++;
        if (current % 20 === 0 || current === 1) {
          const pct = 72 + (current / Math.max(zipfile.entryCount, 1)) * 4;
          this.progress(Math.min(76, pct), `Extracting... ${current}/${zipfile.entryCount}`);
        }
      },
    });

    const rootExe = path.join(installPath, `${APP_NAME}.exe`);
    if (!fs.existsSync(rootExe)) {
      throw new Error(`Payload extracted, but ${APP_NAME}.exe was not found.`);
    }
    this.log('Payload extracted successfully.');
  }

  createExternalFolders(installPath) {
    const externalRoot = installPath;
    fs.mkdirSync(externalRoot, { recursive: true });

    for (const folder of EXTERNAL_FOLDERS) {
      fs.mkdirSync(path.join(externalRoot, folder), { recursive: true });
    }

    const readmePath = path.join(externalRoot, 'README.txt');
    if (!fs.existsSync(readmePath)) {
      fs.writeFileSync(
        readmePath,
        [
          `${APP_NAME} external files`,
          '',
          'The Server Manager reads editable runtime files from these folders.',
          'Put custom scripts in the scripts folder.',
          'These files are intentionally outside the app executable.',
          '',
        ].join('\r\n'),
        'utf8'
      );
    }

    return externalRoot;
  }

  removeDesktopShortcut() {
    const shortcutPath = path.join(os.homedir(), 'Desktop', `${APP_NAME}.lnk`);
    return fs.promises.unlink(shortcutPath).catch(() => {});
  }

  removeStartMenuShortcut() {
    const folder = path.join(
      os.homedir(),
      'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs',
      APP_NAME
    );
    return fs.promises.rm(folder, { recursive: true, force: true }).catch(() => {});
  }

  killRunningApp() {
    return new Promise(resolve => {
      spawn('taskkill', ['/F', '/IM', `${APP_NAME}.exe`, '/T'], {
        windowsHide: true,
        stdio: 'ignore',
      }).on('close', resolve).on('error', resolve);
    });
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  setStartup(installPath, enable) {
    const exe = path.join(installPath, `${APP_NAME}.exe`).replace(/'/g, "''");
    const script = enable
      ? `Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -Name '${APP_NAME}' -Value '"${exe}"'`
      : `Remove-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -Name '${APP_NAME}' -ErrorAction SilentlyContinue`;

    return new Promise((resolve, reject) => {
      const child = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
        windowsHide: true,
        stdio: 'pipe',
      });
      let stderr = '';
      child.stderr.on('data', data => {
        stderr += data.toString();
      });
      child.on('close', code => (code === 0 ? resolve() : reject(new Error(stderr || `Exit ${code}`))));
      child.on('error', reject);
    });
  }
}

module.exports = InstallerController;
