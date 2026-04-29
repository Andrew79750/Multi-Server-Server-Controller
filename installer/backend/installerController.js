const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const http = require('http');
const { spawn } = require('child_process');

const GITHUB_OWNER = 'Andrew79750';
const GITHUB_REPO = 'Multi-Server-Server-Controller';
const APP_NAME = 'ESS Server Controller';
const APP_ASSET_RE = /^ESS-Server-Controller-App-.+\.exe$/i;
const EXTERNAL_FOLDERS = ['scripts', 'configs', 'data', 'logs'];
const GITHUB_EXTERNAL_PATHS = ['scripts'];

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
    const appExePath = path.join(installPath, `${APP_NAME}.exe`);

    try {
      this.progress(5, 'Preparing installation folder...');
      this.log('Creating installation directory...');
      fs.mkdirSync(installPath, { recursive: true });

      this.progress(10, 'Closing any running instances...');
      await this.killRunningApp();
      await this.sleep(1800);

      this.progress(12, 'Fetching latest release from GitHub...');
      this.log('Contacting GitHub API...');
      const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
      const release = await this.fetchJSON(apiUrl);

      const asset = this.pickAppAsset(release.assets || []);
      if (!asset) {
        throw new Error(
          `No Server Manager app EXE found in release ${release.tag_name || '(unknown)'}.\n` +
          'Upload an asset named like "ESS-Server-Controller-App-1.0.0.exe".'
        );
      }
      this.log(`Found release ${release.tag_name || 'latest'} - ${asset.name} (${(asset.size / 1048576).toFixed(1)} MB)`);

      this.progress(15, 'Starting download...');
      await this.downloadFile(asset.browser_download_url, appExePath);
      this.log(`Installed app executable: ${appExePath}`);

      this.progress(76, 'Creating external manager folders...');
      const externalRoot = this.createExternalFolders(installPath);
      this.log(`External manager root: ${externalRoot}`);

      this.progress(78, 'Downloading external files from GitHub...');
      await this.downloadExternalPaths(release.tag_name || 'main', installPath);

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

  fetchJSON(url) {
    return new Promise((resolve, reject) => {
      https.get(url, {
        headers: {
          'User-Agent': 'ESS-Installer/1.0.0',
          Accept: 'application/vnd.github.v3+json',
        },
      }, res => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`GitHub API returned HTTP ${res.statusCode}. Check your internet connection.`));
          return;
        }

        let data = '';
        res.on('data', chunk => {
          data += chunk.toString();
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (_) {
            reject(new Error('Invalid response from GitHub API.'));
          }
        });
        res.on('error', reject);
      }).on('error', err => reject(new Error(`Cannot reach GitHub: ${err.message}`)));
    });
  }

  pickAppAsset(assets) {
    return assets.find(asset => APP_ASSET_RE.test(asset.name || ''));
  }

  downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(destPath);
      let lastLoaded = 0;
      let lastTime = Date.now();

      const fail = (error) => {
        file.destroy();
        fs.promises.unlink(destPath).catch(() => {});
        reject(error);
      };

      const fetch = (nextUrl) => {
        const mod = nextUrl.startsWith('https') ? https : http;
        mod.get(nextUrl, { headers: { 'User-Agent': 'ESS-Installer/1.0.0' } }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            fetch(res.headers.location);
            return;
          }

          if (res.statusCode !== 200) {
            res.resume();
            fail(new Error(`Download failed: HTTP ${res.statusCode}`));
            return;
          }

          const total = parseInt(res.headers['content-length'] || '0', 10);
          let loaded = 0;

          res.on('data', chunk => {
            loaded += chunk.length;
            const now = Date.now();
            const elapsed = (now - lastTime) / 1000;

            if (elapsed >= 0.5 && total > 0) {
              const speed = (loaded - lastLoaded) / elapsed;
              lastLoaded = loaded;
              lastTime = now;
              const pct = 15 + (loaded / total) * 55;
              const loadedMB = (loaded / 1048576).toFixed(1);
              const totalMB = (total / 1048576).toFixed(1);
              const speedStr = speed >= 1048576
                ? `${(speed / 1048576).toFixed(1)} MB/s`
                : `${(speed / 1024).toFixed(0)} KB/s`;
              this.progress(Math.min(70, pct), `Downloading... ${loadedMB} / ${totalMB} MB - ${speedStr}`);
            }
          });

          res.pipe(file);
          res.on('error', fail);
          file.on('finish', () => file.close(resolve));
        }).on('error', err => fail(new Error(`Download error: ${err.message}`)));
      };

      file.on('error', fail);
      fetch(url);
    });
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

  async downloadExternalPaths(ref, installPath) {
    for (const repoPath of GITHUB_EXTERNAL_PATHS) {
      const destPath = path.join(installPath, repoPath);
      try {
        await this.downloadGitHubContents(repoPath, destPath, ref);
      } catch (error) {
        if (/HTTP 404/.test(error.message)) {
          this.log(`No GitHub folder found for ${repoPath}; created an empty local folder.`);
          fs.mkdirSync(destPath, { recursive: true });
          continue;
        }
        throw error;
      }
    }
  }

  async downloadGitHubContents(repoPath, destPath, ref) {
    const encodedPath = repoPath.split('/').map(encodeURIComponent).join('/');
    const encodedRef = encodeURIComponent(ref || 'main');
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodedPath}?ref=${encodedRef}`;
    const entry = await this.fetchJSON(url);

    if (Array.isArray(entry)) {
      fs.mkdirSync(destPath, { recursive: true });
      for (const child of entry) {
        await this.downloadGitHubContents(child.path, path.join(destPath, child.name), ref);
      }
      return;
    }

    if (entry.type !== 'file' || !entry.download_url) return;
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    await this.downloadFile(entry.download_url, destPath);
    this.log(`Downloaded ${entry.path}`);
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
