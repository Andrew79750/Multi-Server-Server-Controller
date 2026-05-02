const path  = require('path');
const os    = require('os');
const fs    = require('fs');
const { spawn } = require('child_process');

const APP_NAME = 'ESS Server Controller';
const REG_KEY  = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ESSServerController';
const APP_REG_KEY = 'HKCU:\\Software\\ESS\\ServerController';
const RUN_KEY = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const DEFAULT_INSTALL_DIR = path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'ESS-Multi-Server-Manager');

function ps(script, { rejectOnError = false } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true,
      stdio: 'pipe',
    });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', data => { stdout += data.toString(); });
    p.stderr.on('data', data => { stderr += data.toString(); });
    p.on('close', code => {
      if (rejectOnError && code !== 0) {
        reject(new Error(stderr.trim() || `PowerShell exited with ${code}`));
        return;
      }
      resolve({ code, stdout, stderr });
    });
    p.on('error', error => (rejectOnError ? reject(error) : resolve({ code: 1, stdout: '', stderr: error.message })));
  });
}

function esc(str) { return str.replace(/'/g, "''"); }

function normalizeVersion(value) {
  return String(value || '').trim().replace(/^v/i, '') || '1.0.0';
}

function desktopShortcutPath() {
  return path.join(os.homedir(), 'Desktop', `${APP_NAME}.lnk`);
}

function startMenuFolderPath() {
  return path.join(
    os.homedir(),
    'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs',
    APP_NAME
  );
}

function exePathFor(installPath) {
  return path.join(installPath, `${APP_NAME}.exe`);
}

function normalizeTarget(value) {
  return path.resolve(String(value || '').trim());
}

async function registryInstallPath() {
  const script = `
$ErrorActionPreference = 'SilentlyContinue'
$item = Get-ItemProperty -Path '${esc(REG_KEY)}'
if ($item -and $item.InstallLocation) { Write-Output $item.InstallLocation }
`.trim();
  const result = await ps(script);
  return result.stdout.trim().split(/\r?\n/).filter(Boolean).pop() || '';
}

async function resolveInstallPath(fallbackPath = DEFAULT_INSTALL_DIR) {
  const fromRegistry = await registryInstallPath();
  return normalizeTarget(fromRegistry || fallbackPath || DEFAULT_INSTALL_DIR);
}

function getInstalledInfoSync(installPath) {
  const target = normalizeTarget(installPath || DEFAULT_INSTALL_DIR);
  const exePath = exePathFor(target);
  return {
    installed: fs.existsSync(exePath),
    installPath: target,
    exePath,
  };
}

async function getInstalledInfo(fallbackPath = DEFAULT_INSTALL_DIR) {
  const installPath = await resolveInstallPath(fallbackPath);
  return getInstalledInfoSync(installPath);
}

function validateUninstallTarget(installPath) {
  const target = normalizeTarget(installPath);
  const exePath = exePathFor(target);
  if (!path.isAbsolute(target)) {
    throw new Error('Uninstall target must be an absolute path.');
  }

  if (!fs.existsSync(exePath)) {
    throw new Error(`${APP_NAME}.exe was not found in the uninstall target.`);
  }

  const unsafeNames = new Set(['', 'users', 'programs', 'program files', 'program files (x86)', 'appdata', 'local', 'roaming']);
  if (path.parse(target).root === target || unsafeNames.has(path.basename(target).toLowerCase())) {
    throw new Error('The uninstall target is too broad to remove safely.');
  }

  return { installPath: target, exePath };
}

function killRunningApp() {
  return new Promise(resolve => {
    spawn('taskkill', ['/F', '/IM', `${APP_NAME}.exe`, '/T'], {
      windowsHide: true,
      stdio: 'ignore',
    }).on('close', resolve).on('error', resolve);
  });
}

function removeFile(filePath) {
  return fs.promises.rm(filePath, { force: true }).catch(() => {});
}

function removeFolder(folderPath) {
  return fs.promises.rm(folderPath, { recursive: true, force: true }).catch(() => {});
}

async function removeRegistryEntries() {
  const script = `
Remove-Item -Path '${esc(APP_REG_KEY)}' -Recurse -Force -ErrorAction SilentlyContinue
Remove-ItemProperty -Path '${esc(RUN_KEY)}' -Name '${esc(APP_NAME)}' -ErrorAction SilentlyContinue
Remove-Item -Path '${esc(REG_KEY)}' -Recurse -Force -ErrorAction SilentlyContinue
`.trim();
  await ps(script);
}

async function uninstall({ installPath } = {}, events = {}) {
  const emitProgress = events.progress || (() => {});
  const emitLog = events.log || (() => {});
  const emitComplete = events.complete || (() => {});

  const resolvedPath = installPath ? normalizeTarget(installPath) : await resolveInstallPath();
  const target = validateUninstallTarget(resolvedPath);

  emitProgress(5, 'Preparing uninstall...');
  emitLog(`Uninstall target: ${target.installPath}`);

  emitProgress(15, 'Closing ESS Server Controller...');
  emitLog('Closing running ESS Server Controller processes...');
  await killRunningApp();

  emitProgress(28, 'Removing shortcuts...');
  emitLog('Removing desktop shortcut...');
  await removeFile(desktopShortcutPath());
  emitLog('Removing Start Menu shortcut folder...');
  await removeFolder(startMenuFolderPath());

  emitProgress(45, 'Removing startup and registry entries...');
  emitLog('Removing startup entry and uninstall registration...');
  await removeRegistryEntries();

  emitProgress(70, 'Removing application files...');
  emitLog('Deleting install directory...');
  await removeFolder(target.installPath);

  if (fs.existsSync(target.installPath)) {
    throw new Error('The install directory could not be fully removed. Close any open files and try again.');
  }

  emitProgress(100, 'Uninstall complete.');
  emitLog(`${APP_NAME} was removed successfully.`);
  emitComplete({ installPath: target.installPath });
  return { installPath: target.installPath };
}

async function create(installPath, version = '1.0.0') {
  const exePath      = path.join(installPath, `${APP_NAME}.exe`);
  const batPath      = path.join(installPath, `Uninstall ${APP_NAME}.bat`);
  const startMenuDir = `%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\${APP_NAME}`;
  const desktopLnk   = `%USERPROFILE%\\Desktop\\${APP_NAME}.lnk`;
  const displayVersion = normalizeVersion(version);

  const bat = [
    '@echo off',
    `echo Uninstalling ${APP_NAME}...`,
    `taskkill /F /IM "${APP_NAME}.exe" /T 2>nul`,
    'ping -n 3 127.0.0.1 >nul',
    `rmdir /s /q "${installPath}"`,
    `del "${desktopLnk}" 2>nul`,
    `rmdir /s /q "${startMenuDir}" 2>nul`,
    `reg delete "HKCU\\Software\\ESS\\ServerController" /f 2>nul`,
    `reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "${APP_NAME}" /f 2>nul`,
    `reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ESSServerController" /f 2>nul`,
    `echo ${APP_NAME} has been uninstalled.`,
    'pause',
  ].join('\r\n');

  fs.writeFileSync(batPath, bat, 'utf8');

  // Register in Programs & Features (per-user, no admin needed)
  const script = `
$key = '${esc(REG_KEY)}'
New-Item -Path $key -Force | Out-Null
Set-ItemProperty -Path $key -Name 'DisplayName'     -Value '${esc(APP_NAME)}'
Set-ItemProperty -Path $key -Name 'DisplayVersion'  -Value '${esc(displayVersion)}'
Set-ItemProperty -Path $key -Name 'Publisher'       -Value 'ESS'
Set-ItemProperty -Path $key -Name 'InstallLocation' -Value '${esc(installPath)}'
Set-ItemProperty -Path $key -Name 'DisplayIcon'     -Value '${esc(exePath)}'
Set-ItemProperty -Path $key -Name 'UninstallString' -Value '"${esc(batPath)}"'
Set-ItemProperty -Path $key -Name 'NoModify'        -Value 1 -Type DWord
Set-ItemProperty -Path $key -Name 'NoRepair'        -Value 1 -Type DWord
`.trim();

  await ps(script);
}

module.exports = {
  create,
  getInstalledInfo,
  getInstalledInfoSync,
  uninstall,
  DEFAULT_INSTALL_DIR,
};
