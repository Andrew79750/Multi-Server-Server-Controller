const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const { spawn } = require('child_process');
const extractZip = require('extract-zip');

const APP_NAME = 'ESS Server Controller';
const EXTERNAL_FOLDERS = ['scripts', 'configs', 'data', 'logs'];
const RELEASE_OWNER = 'Andrew79750';
const RELEASE_REPO = 'Multi-Server-Server-Controller';
const RELEASE_TAG = process.env.ESS_RELEASE_TAG || 'BETA';
const RELEASE_BY_TAG_API = `https://api.github.com/repos/${RELEASE_OWNER}/${RELEASE_REPO}/releases/tags/${encodeURIComponent(RELEASE_TAG)}`;
const LATEST_RELEASE_API = `https://api.github.com/repos/${RELEASE_OWNER}/${RELEASE_REPO}/releases/latest`;

function normalizeVersion(value) {
  return String(value || '').trim().replace(/^v/i, '');
}

function compareVersions(left, right) {
  const a = normalizeVersion(left).split('.').map(part => Number.parseInt(part, 10) || 0);
  const b = normalizeVersion(right).split('.').map(part => Number.parseInt(part, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function versionFromRelease(release) {
  const candidates = [
    release.name,
    release.tag_name,
    ...(release.assets || []).map(asset => asset.name),
  ];

  for (const value of candidates) {
    const match = String(value || '').match(/v?(\d+\.\d+\.\d+(?:[-+][a-z0-9.-]+)?)/i);
    if (match) return normalizeVersion(match[1]);
  }

  return normalizeVersion(release.tag_name);
}

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

  repairProgress(percent, message) {
    this.win.webContents.send('repair:progress', { percent, message });
  }

  repairLog(message) {
    this.win.webContents.send('repair:log', message);
  }

  repairError(message) {
    this.win.webContents.send('repair:error', message);
  }

  repairComplete(details) {
    this.win.webContents.send('repair:complete', details);
  }

  async install(opts) {
    this.opts = opts;
    const { installPath } = opts;
    let payload = null;

    try {
      this.progress(5, 'Preparing installation folder...');
      this.log('Creating installation directory...');
      fs.mkdirSync(installPath, { recursive: true });

      this.progress(10, 'Closing any running instances...');
      await this.killRunningApp();
      await this.sleep(1800);

      this.progress(12, 'Checking GitHub release...');
      payload = await this.downloadReleasePayload();

      this.progress(72, 'Extracting Server Manager files...');
      await this.extractPayload(payload.zipPath, installPath);
      this.writeInstalledMetadata(installPath, payload.version, payload.release);

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
      await require('./uninstallManager').create(installPath, payload.version);

      this.progress(100, 'Installation complete!');
      this.log('ESS Server Controller installed successfully.');
      this.complete({ installPath, externalRoot });
    } catch (err) {
      this.error(err.message || String(err));
      throw err;
    } finally {
      if (payload?.zipPath) {
        fs.promises.rm(path.dirname(payload.zipPath), { recursive: true, force: true }).catch(() => {});
      }
    }
  }

  async repair({ installPath } = {}) {
    const target = this.validateRepairTarget(installPath);
    let payload = null;
    let extractDir = null;

    const originalProgress = this.progress.bind(this);
    const originalLog = this.log.bind(this);
    this.progress = this.repairProgress.bind(this);
    this.log = this.repairLog.bind(this);

    try {
      this.progress(5, 'Validating installed application...');
      this.log(`Repair target: ${target.installPath}`);
      this.log(`${APP_NAME}.exe found in repair target.`);

      this.progress(10, 'Checking startup setting...');
      const startupWasEnabled = await this.hasStartupEntry();
      this.log(startupWasEnabled ? 'Existing startup entry detected.' : 'No startup entry detected.');

      this.progress(14, 'Closing ESS Server Controller...');
      this.log('Closing running ESS Server Controller processes...');
      await this.killRunningApp();
      await this.sleep(1200);

      this.progress(18, 'Downloading current release payload...');
      payload = await this.downloadReleasePayload();

      this.progress(70, 'Staging repair files...');
      extractDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ess-repair-'));
      await this.extractPayload(payload.zipPath, extractDir);

      this.progress(78, 'Restoring application files...');
      await this.copyRepairFiles(extractDir, target.installPath);
      this.writeInstalledMetadata(target.installPath, payload.version, payload.release);
      this.log('Application files restored without deleting runtime folders.');

      this.progress(84, 'Recreating runtime folders...');
      const externalRoot = this.createExternalFolders(target.installPath);
      this.log(`Runtime folders verified: ${EXTERNAL_FOLDERS.join(', ')}`);

      this.progress(88, 'Checking shortcuts...');
      await this.recreateMissingShortcuts(target.installPath);

      this.progress(92, 'Re-registering uninstaller...');
      this.log('Writing custom uninstaller registration...');
      await require('./uninstallManager').create(target.installPath, payload.version);

      if (startupWasEnabled) {
        this.progress(96, 'Restoring startup entry...');
        await this.setStartup(target.installPath, true);
        this.log('Startup entry restored.');
      } else {
        this.progress(96, 'Leaving startup setting unchanged...');
        this.log('Startup setting left untouched.');
      }

      this.progress(100, 'Repair complete!');
      this.log(`${APP_NAME} repair completed successfully.`);
      this.repairComplete({ installPath: target.installPath, externalRoot });
      return { installPath: target.installPath };
    } catch (err) {
      this.repairError(err.message || String(err));
      throw err;
    } finally {
      this.progress = originalProgress;
      this.log = originalLog;
      if (payload?.zipPath) {
        fs.promises.rm(path.dirname(payload.zipPath), { recursive: true, force: true }).catch(() => {});
      }
      if (extractDir) {
        fs.promises.rm(extractDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  }

  requestJson(url) {
    return new Promise((resolve, reject) => {
      const request = https.get(url, {
        headers: {
          'User-Agent': 'ESS-Server-Controller-Setup',
          'Accept': 'application/vnd.github+json',
        },
        timeout: 20000,
      }, response => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', chunk => { body += chunk; });
        response.on('end', () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`GitHub release lookup failed (${response.statusCode}).`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(new Error(`Could not parse GitHub release response: ${error.message}`));
          }
        });
      });
      request.on('timeout', () => request.destroy(new Error('GitHub release lookup timed out.')));
      request.on('error', reject);
    });
  }

  pickPayloadAsset(assets) {
    const zipAssets = (assets || []).filter(asset => /\.zip$/i.test(asset.name || ''));
    const preferred = zipAssets.find(asset => /payload/i.test(asset.name || ''));
    const fallback = zipAssets.find(asset => !/(setup|installer)/i.test(asset.name || ''));
    return preferred || fallback || null;
  }

  async getRelease() {
    try {
      return await this.requestJson(RELEASE_BY_TAG_API);
    } catch (error) {
      this.log?.(`Tagged release lookup failed (${error.message}); trying latest stable release...`);
      return this.requestJson(LATEST_RELEASE_API);
    }
  }

  getInstalledInfo(installPath) {
    const exePath = path.join(installPath, `${APP_NAME}.exe`);
    const metadataPath = path.join(installPath, 'installed-version.json');
    const packagePath = path.join(installPath, 'resources', 'app', 'package.json');
    const installed = fs.existsSync(exePath);

    let version = '';
    if (fs.existsSync(metadataPath)) {
      try {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        version = normalizeVersion(metadata.version || metadata.tagName);
      } catch {
        version = '';
      }
    }

    if (fs.existsSync(packagePath)) {
      try {
        version = version || normalizeVersion(JSON.parse(fs.readFileSync(packagePath, 'utf8')).version);
      } catch {
        version = version || '';
      }
    }

    return { installed, version, installPath, exePath, packagePath, metadataPath };
  }

  async checkForUpdates(currentVersion) {
    const release = await this.getRelease();
    const latestVersion = versionFromRelease(release);
    const asset = this.pickPayloadAsset(release.assets);

    return {
      currentVersion: normalizeVersion(currentVersion),
      latestVersion,
      releaseName: release.name || release.tag_name || '',
      tagName: release.tag_name || '',
      releaseUrl: release.html_url || '',
      updateAvailable: Boolean(latestVersion && compareVersions(latestVersion, currentVersion) > 0),
      payloadAvailable: Boolean(asset?.browser_download_url),
    };
  }

  async downloadReleasePayload() {
    this.log(`Reading ${RELEASE_TAG} release from ${RELEASE_OWNER}/${RELEASE_REPO}...`);
    const release = await this.getRelease();
    const version = versionFromRelease(release);

    const asset = this.pickPayloadAsset(release.assets);

    if (!asset?.browser_download_url) {
      throw new Error(
        `No payload ZIP was found on the ${release.tag_name || 'selected'} GitHub release. Upload a ZIP asset with "payload" in its name.`
      );
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ess-setup-'));
    const zipPath = path.join(tempDir, asset.name);
    this.log(`Downloading ${asset.name} from ${release.tag_name || 'latest release'}...`);
    await this.downloadFile(asset.browser_download_url, zipPath);
    this.log(`Downloaded release payload: ${asset.name}`);
    return { zipPath, version, release };
  }

  writeInstalledMetadata(installPath, version, release = {}) {
    const normalized = normalizeVersion(version);
    if (!normalized) return;
    const metadataPath = path.join(installPath, 'installed-version.json');
    const metadata = {
      version: normalized,
      source: 'github-release',
      owner: RELEASE_OWNER,
      repo: RELEASE_REPO,
      tagName: release.tag_name || '',
      releaseName: release.name || '',
      releaseUrl: release.html_url || '',
      installedAt: new Date().toISOString()
    };
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
    this.log(`Recorded installed version: v${normalized}`);
  }

  downloadFile(url, destination, redirects = 0) {
    return new Promise((resolve, reject) => {
      if (redirects > 5) {
        reject(new Error('Too many redirects while downloading release payload.'));
        return;
      }

      const request = https.get(url, {
        headers: {
          'User-Agent': 'ESS-Server-Controller-Setup',
          'Accept': 'application/octet-stream',
        },
        timeout: 30000,
      }, response => {
        if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
          response.resume();
          const redirectUrl = new URL(response.headers.location, url).toString();
          this.downloadFile(redirectUrl, destination, redirects + 1).then(resolve, reject);
          return;
        }

        if (response.statusCode < 200 || response.statusCode >= 300) {
          response.resume();
          reject(new Error(`Payload download failed (${response.statusCode}).`));
          return;
        }

        const total = Number(response.headers['content-length'] || 0);
        let downloaded = 0;
        const file = fs.createWriteStream(destination);

        response.on('data', chunk => {
          downloaded += chunk.length;
          if (total > 0) {
            const pct = 16 + (downloaded / total) * 52;
            this.progress(Math.min(68, pct), `Downloading payload... ${Math.round(downloaded / 1024 / 1024)} MB`);
          }
        });

        response.pipe(file);
        file.on('finish', () => file.close(resolve));
        file.on('error', error => {
          fs.promises.rm(destination, { force: true }).catch(() => {});
          reject(error);
        });
      });

      request.on('timeout', () => request.destroy(new Error('Payload download timed out.')));
      request.on('error', reject);
    });
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

  validateRepairTarget(installPath) {
    const rawTarget = String(installPath || '').trim();
    if (!rawTarget) {
      throw new Error('Repair target cannot be empty.');
    }

    if (!path.isAbsolute(rawTarget)) {
      throw new Error('Repair target must be an absolute path.');
    }

    const target = path.resolve(rawTarget);
    const exePath = path.join(target, `${APP_NAME}.exe`);
    if (!fs.existsSync(target)) {
      throw new Error('The install folder was not found.');
    }
    if (!fs.statSync(target).isDirectory()) {
      throw new Error('The repair target is not a folder.');
    }
    if (!fs.existsSync(exePath)) {
      throw new Error(`${APP_NAME}.exe was not found in the repair target.`);
    }

    const unsafeNames = new Set(['', 'users', 'programs', 'program files', 'program files (x86)', 'appdata', 'local', 'roaming']);
    if (path.parse(target).root === target || unsafeNames.has(path.basename(target).toLowerCase())) {
      throw new Error('The repair target is too broad to modify safely.');
    }

    return { installPath: target, exePath };
  }

  async copyRepairFiles(sourceDir, installPath) {
    const skipNames = new Set(EXTERNAL_FOLDERS.map(name => name.toLowerCase()));
    const copyRecursive = async (src, dest, relative = '') => {
      const entries = await fs.promises.readdir(src, { withFileTypes: true });
      await fs.promises.mkdir(dest, { recursive: true });

      for (const entry of entries) {
        const rel = path.join(relative, entry.name);
        if (!relative && skipNames.has(entry.name.toLowerCase())) {
          this.log(`Preserving existing ${entry.name} folder.`);
          continue;
        }

        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
          await copyRecursive(srcPath, destPath, rel);
        } else if (entry.isFile()) {
          await fs.promises.copyFile(srcPath, destPath);
        }
      }
    };

    await copyRecursive(sourceDir, installPath);
    const exePath = path.join(installPath, `${APP_NAME}.exe`);
    if (!fs.existsSync(exePath)) {
      throw new Error(`${APP_NAME}.exe was not restored during repair.`);
    }
  }

  async recreateMissingShortcuts(installPath) {
    const shortcutManager = require('./shortcutManager');
    if (!shortcutManager.hasDesktopShortcut()) {
      this.log('Desktop shortcut missing; recreating...');
      await shortcutManager.createDesktopShortcut(installPath);
    } else {
      this.log('Desktop shortcut already exists.');
    }

    if (!shortcutManager.hasStartMenuShortcut()) {
      this.log('Start Menu shortcut missing; recreating...');
      await shortcutManager.createStartMenuShortcut(installPath);
    } else {
      this.log('Start Menu shortcut already exists.');
    }
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
    const exe = path.join(installPath, `${APP_NAME}.exe`);
    const runKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
    const args = enable
      ? ['add', runKey, '/v', APP_NAME, '/t', 'REG_SZ', '/d', `"${exe}"`, '/f']
      : ['delete', runKey, '/v', APP_NAME, '/f'];

    return new Promise(resolve => {
      const child = spawn('reg', args, {
        windowsHide: true,
        stdio: 'pipe',
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', data => {
        stdout += data.toString();
      });
      child.stderr.on('data', data => {
        stderr += data.toString();
      });
      child.on('close', code => {
        if (code === 0) {
          this.log(enable ? 'Startup entry enabled.' : 'Startup entry disabled.');
          resolve();
          return;
        }

        const details = [stderr.trim(), stdout.trim()].filter(Boolean).join('\n');
        this.log(
          enable
            ? `WARNING: Could not enable startup entry. ${details || `reg.exe exited with ${code}.`}`
            : 'Startup entry was already absent.'
        );
        resolve();
      });
      child.on('error', error => {
        this.log(`WARNING: Could not update startup entry. ${error.message}`);
        resolve();
      });
    });
  }

  hasStartupEntry() {
    const script = `
$ErrorActionPreference = 'SilentlyContinue'
$item = Get-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
if ($item -and $item.'${APP_NAME}') { Write-Output '1' }
`.trim();

    return new Promise(resolve => {
      const child = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
        windowsHide: true,
        stdio: 'pipe',
      });
      let stdout = '';
      child.stdout.on('data', data => { stdout += data.toString(); });
      child.on('close', () => resolve(stdout.trim() === '1'));
      child.on('error', () => resolve(false));
    });
  }
}

module.exports = InstallerController;
