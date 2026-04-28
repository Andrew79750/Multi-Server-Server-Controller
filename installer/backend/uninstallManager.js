const path  = require('path');
const fs    = require('fs');
const { spawn } = require('child_process');

const APP_NAME = 'ESS Server Controller';
const REG_KEY  = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ESSServerController';

function ps(script) {
  return new Promise((resolve) => {
    const p = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true,
      stdio: 'pipe',
    });
    p.on('close', resolve);
  });
}

function esc(str) { return str.replace(/'/g, "''"); }

async function create(installPath) {
  const exePath      = path.join(installPath, `${APP_NAME}.exe`);
  const batPath      = path.join(installPath, `Uninstall ${APP_NAME}.bat`);
  const startMenuDir = `%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\${APP_NAME}`;
  const desktopLnk   = `%USERPROFILE%\\Desktop\\${APP_NAME}.lnk`;

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
Set-ItemProperty -Path $key -Name 'DisplayVersion'  -Value '1.0.0'
Set-ItemProperty -Path $key -Name 'Publisher'       -Value 'ESS'
Set-ItemProperty -Path $key -Name 'InstallLocation' -Value '${esc(installPath)}'
Set-ItemProperty -Path $key -Name 'DisplayIcon'     -Value '${esc(exePath)}'
Set-ItemProperty -Path $key -Name 'UninstallString' -Value '"${esc(batPath)}"'
Set-ItemProperty -Path $key -Name 'NoModify'        -Value 1 -Type DWord
Set-ItemProperty -Path $key -Name 'NoRepair'        -Value 1 -Type DWord
`.trim();

  await ps(script);
}

module.exports = { create };
