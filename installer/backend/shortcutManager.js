const path  = require('path');
const os    = require('os');
const fs    = require('fs');
const { shell } = require('electron');

const APP_NAME = 'ESS Server Controller';

function createLnk(linkPath, targetExe, workDir, iconPath, description) {
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });

  const success = shell.writeShortcutLink(linkPath, {
    target: targetExe,
    cwd: workDir,
    icon: iconPath,
    iconIndex: 0,
    description,
  });

  if (!success || !fs.existsSync(linkPath)) {
    throw new Error(`Windows did not create shortcut: ${linkPath}`);
  }
}

function desktopShortcutPath() {
  return path.join(os.homedir(), 'Desktop', `${APP_NAME}.lnk`);
}

function startMenuShortcutPath() {
  return path.join(
    os.homedir(),
    'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs',
    APP_NAME,
    `${APP_NAME}.lnk`
  );
}

async function createDesktopShortcut(installPath) {
  const exePath  = path.join(installPath, `${APP_NAME}.exe`);
  const linkPath = desktopShortcutPath();
  createLnk(linkPath, exePath, installPath, exePath, APP_NAME);
}

async function createStartMenuShortcut(installPath) {
  const exePath = path.join(installPath, `${APP_NAME}.exe`);
  const folder  = path.join(
    os.homedir(),
    'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs',
    APP_NAME
  );
  const linkPath = path.join(folder, `${APP_NAME}.lnk`);
  createLnk(linkPath, exePath, installPath, exePath, APP_NAME);
}

function hasDesktopShortcut() {
  return fs.existsSync(desktopShortcutPath());
}

function hasStartMenuShortcut() {
  return fs.existsSync(startMenuShortcutPath());
}

module.exports = {
  createDesktopShortcut,
  createStartMenuShortcut,
  hasDesktopShortcut,
  hasStartMenuShortcut,
};
