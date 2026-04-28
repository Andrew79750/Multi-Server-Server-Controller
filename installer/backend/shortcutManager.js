const path  = require('path');
const os    = require('os');
const fs    = require('fs');
const { spawn } = require('child_process');

const APP_NAME = 'ESS Server Controller';

function esc(str) {
  return str.replace(/'/g, "''");
}

function createLnk(linkPath, targetExe, workDir, iconPath, description) {
  const script = `
$ws = New-Object -ComObject WScript.Shell
$s  = $ws.CreateShortcut('${esc(linkPath)}')
$s.TargetPath       = '${esc(targetExe)}'
$s.WorkingDirectory = '${esc(workDir)}'
$s.IconLocation     = '${esc(iconPath)}'
$s.Description      = '${esc(description)}'
$s.Save()
`.trim();

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

async function createDesktopShortcut(installPath) {
  const exePath  = path.join(installPath, `${APP_NAME}.exe`);
  const linkPath = path.join(os.homedir(), 'Desktop', `${APP_NAME}.lnk`);
  await createLnk(linkPath, exePath, installPath, exePath, APP_NAME);
}

async function createStartMenuShortcut(installPath) {
  const exePath = path.join(installPath, `${APP_NAME}.exe`);
  const folder  = path.join(
    os.homedir(),
    'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs',
    APP_NAME
  );
  fs.mkdirSync(folder, { recursive: true });
  const linkPath = path.join(folder, `${APP_NAME}.lnk`);
  await createLnk(linkPath, exePath, installPath, exePath, APP_NAME);
}

module.exports = { createDesktopShortcut, createStartMenuShortcut };
