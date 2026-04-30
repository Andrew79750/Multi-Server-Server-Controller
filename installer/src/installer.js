'use strict';

// State
let currentStep = 0;
let installPath = '';
let completedPath = '';
let uninstallPath = '';
let installedInfo = null;
let pendingInstallOptions = null;
let installWarningDismissed = false;
let flowMode = 'install';

const $ = id => document.getElementById(id);

const stepLabels = {
  install: [
    ['Welcome', 'Get started'],
    ['Options', 'Install location & shortcuts'],
    ['Installing', 'Copying files'],
    ['Complete', 'Ready to launch'],
  ],
  uninstall: [
    ['Uninstall', 'Confirm removal'],
    ['Confirm', 'Safety check'],
    ['Removing', 'Cleaning files'],
    ['Complete', 'Removed cleanly'],
  ],
};

// Canvas background animation
function startBgAnimation() {
  const canvas = $('bg-canvas');
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  const orbs = [
    { x: 0.75, y: 0.15, r: 260, color: [59, 130, 246], speed: 0.0006, ox: 0, oy: 0 },
    { x: 0.20, y: 0.78, r: 210, color: [124, 58, 237], speed: 0.0004, ox: 1.5, oy: 0.9 },
    { x: 0.50, y: 0.45, r: 170, color: [6, 182, 212], speed: 0.0003, ox: 3.2, oy: 2.1 },
  ];

  const GRID = 44;
  let t = 0;

  function draw() {
    t++;
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);

    const gOff = (t * 0.35) % GRID;
    ctx.strokeStyle = 'rgba(59,130,246,0.06)';
    ctx.lineWidth = 1;
    for (let x = -GRID + gOff; x < W + GRID; x += GRID) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = -GRID + gOff; y < H + GRID; y += GRID) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    for (const orb of orbs) {
      const cx = (orb.x + 0.14 * Math.sin(t * orb.speed + orb.ox)) * W;
      const cy = (orb.y + 0.12 * Math.cos(t * orb.speed * 0.7 + orb.oy)) * H;
      const r = orb.r * (1 + 0.06 * Math.sin(t * orb.speed * 1.3 + orb.oy));
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, `rgba(${orb.color.join(',')},0.22)`);
      grad.addColorStop(0.4, `rgba(${orb.color.join(',')},0.10)`);
      grad.addColorStop(1, `rgba(${orb.color.join(',')},0.00)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.85);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
    requestAnimationFrame(draw);
  }

  requestAnimationFrame(draw);
}

document.addEventListener('click', e => {
  const btn = e.target.closest('.btn');
  if (!btn || btn.disabled) return;
  const rect = btn.getBoundingClientRect();
  const ripple = document.createElement('span');
  ripple.className = 'ripple';
  ripple.style.left = `${e.clientX - rect.left}px`;
  ripple.style.top = `${e.clientY - rect.top}px`;
  btn.appendChild(ripple);
  setTimeout(() => ripple.remove(), 600);
});

function showErrorPopup(msg, title = 'Installation Error') {
  $('ep-title').textContent = title;
  $('ep-msg').textContent = msg;
  const overlay = $('error-overlay');
  overlay.classList.remove('hidden');
  const popup = $('error-popup');
  popup.style.animation = 'none';
  void popup.offsetWidth;
  popup.style.animation = '';
}

function hideErrorPopup() { $('error-overlay').classList.add('hidden'); }

function showUpdatePopup({ title, message, mode = 'warning', primaryText = 'Search Updates', secondaryText = 'Not now', onPrimary, onSecondary }) {
  $('up-title').textContent = title;
  $('up-msg').textContent = message;
  $('up-primary').textContent = primaryText;
  $('up-secondary').textContent = secondaryText;
  $('up-primary').disabled = mode === 'checking';
  $('up-secondary').disabled = mode === 'checking';
  $('up-spinner').classList.toggle('hidden', mode !== 'checking');
  $('up-icon-wrap').querySelector('.up-warning-icon').classList.toggle('hidden', mode === 'checking');
  $('up-primary').classList.toggle('btn-danger', mode === 'danger');
  $('up-primary').classList.toggle('btn-primary', mode !== 'danger');

  $('up-primary').onclick = onPrimary || hideUpdatePopup;
  $('up-secondary').onclick = onSecondary || hideUpdatePopup;

  const overlay = $('update-overlay');
  overlay.classList.remove('hidden');
  const popup = $('update-popup');
  popup.classList.toggle('danger-modal', mode === 'danger');
  popup.style.animation = 'none';
  void popup.offsetWidth;
  popup.style.animation = '';
}

function hideUpdatePopup() {
  $('update-overlay').classList.add('hidden');
}

function versionLabel(version) {
  return version ? `v${version}` : 'an unknown version';
}

async function refreshInstalledInfo(pathToCheck = installPath) {
  installedInfo = await window.api.installedInfo(pathToCheck);
  return installedInfo;
}

async function refreshUninstallInfo() {
  const info = await window.api.uninstallInfo(installPath || undefined);
  uninstallPath = info.installPath || installPath;
  $('uninstall-target').textContent = uninstallPath || 'Not found';
  $('btn-uninstall').disabled = !info.installed;
  $('uninstall-card').classList.toggle('is-disabled', !info.installed);
  $('uninstall-state').textContent = info.installed
    ? 'Installed app detected'
    : 'No installed copy found';
  return info;
}

function showInstalledWarning(info) {
  showUpdatePopup({
    title: 'Existing Installation Detected',
    message: `ESS Server Controller ${versionLabel(info.version)} is already installed. Would you like to search for updates?`,
    primaryText: 'Yes, Check',
    secondaryText: 'No',
    onPrimary: () => checkForUpdates(info),
    onSecondary: () => {
      installWarningDismissed = true;
      pendingInstallOptions = null;
      hideUpdatePopup();
    },
  });
}

async function checkForUpdates(info) {
  showUpdatePopup({
    title: 'Checking for Updates',
    message: 'Looking for the newest ESS Server Controller release...',
    mode: 'checking',
  });

  try {
    const result = await window.api.checkUpdates(info.version);
    if (!result.updateAvailable) {
      showUpdatePopup({
        title: 'No Updates Found',
        message: `You already have ${versionLabel(info.version)} installed. No newer release is available right now.`,
        primaryText: 'OK',
        secondaryText: 'Close',
        onPrimary: hideUpdatePopup,
        onSecondary: hideUpdatePopup,
      });
      pendingInstallOptions = null;
      return;
    }

    if (!result.payloadAvailable) {
      showUpdatePopup({
        title: 'Update Found',
        message: `${versionLabel(result.latestVersion)} is available, but no install payload was attached to the release yet.`,
        primaryText: 'OK',
        secondaryText: 'Close',
        onPrimary: hideUpdatePopup,
        onSecondary: hideUpdatePopup,
      });
      return;
    }

    showUpdatePopup({
      title: 'Update Available',
      message: `ESS Server Controller ${versionLabel(result.latestVersion)} is available. Would you like to upgrade to ${versionLabel(result.latestVersion)}?`,
      primaryText: 'Upgrade',
      secondaryText: 'Later',
      onPrimary: () => {
        const opts = pendingInstallOptions || buildInstallOptions();
        installWarningDismissed = true;
        pendingInstallOptions = null;
        hideUpdatePopup();
        beginInstall(opts);
      },
      onSecondary: () => {
        pendingInstallOptions = null;
        hideUpdatePopup();
      },
    });
  } catch (error) {
    showUpdatePopup({
      title: 'Update Check Failed',
      message: error.message || String(error),
      primaryText: 'OK',
      secondaryText: 'Close',
      onPrimary: hideUpdatePopup,
      onSecondary: hideUpdatePopup,
    });
  }
}

function setStepperMode(mode) {
  flowMode = mode;
  stepLabels[mode].forEach(([title, desc], index) => {
    $(`sr-${index}`).querySelector('.step-title').textContent = title;
    $(`sr-${index}`).querySelector('.step-desc').textContent = desc;
  });
  document.body.classList.toggle('uninstall-mode', mode === 'uninstall');
}

function goTo(step, mode = flowMode) {
  if (mode !== flowMode) setStepperMode(mode);
  const pages = ['page-0', 'page-1', 'page-2', 'page-3'];
  const rows = ['sr-0', 'sr-1', 'sr-2', 'sr-3'];

  const cur = $(pages[currentStep]);
  cur.classList.add('slide-out');
  setTimeout(() => { cur.classList.add('hidden'); cur.classList.remove('slide-out'); }, 300);

  const next = $(pages[step]);
  next.style.transition = 'none';
  next.classList.remove('hidden');
  next.style.opacity = '0';
  next.style.transform = 'translateX(32px) scale(.98)';
  next.style.filter = 'blur(3px)';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    next.style.transition = '';
    next.style.opacity = '';
    next.style.transform = '';
    next.style.filter = '';
  }));

  rows.forEach((id, i) => {
    const el = $(id);
    el.classList.remove('active', 'done');
    if (i < step) el.classList.add('done');
    else if (i === step) el.classList.add('active');
  });
  currentStep = step;
}

function setProgress(pct, msg, mode = flowMode) {
  const ids = mode === 'uninstall' ? activeIdsFor('uninstall') : activeIdsFor('install');
  $(ids.fill).style.width = `${pct}%`;
  $(ids.pct).textContent = `${Math.round(pct)}%`;
  if (msg) $(ids.status).textContent = msg;
}

function activeIdsFor(mode) {
  return mode === 'uninstall'
    ? { fill: 'uninstall-progress-fill', pct: 'uninstall-progress-pct', status: 'uninstall-status', log: 'uninstall-log-panel' }
    : { fill: 'progress-fill', pct: 'progress-pct', status: 'install-status', log: 'log-panel' };
}

function addLog(msg, type = '', mode = flowMode) {
  const ids = activeIdsFor(mode);
  const panel = $(ids.log);
  const line = document.createElement('div');
  line.className = `log-line ${type}`;
  line.textContent = `> ${msg}`;
  panel.appendChild(line);
  panel.scrollTop = panel.scrollHeight;
}

function handleError(msg, mode = flowMode) {
  const ids = activeIdsFor(mode);
  const status = $(ids.status);
  status.textContent = mode === 'uninstall' ? 'Uninstall failed.' : 'Installation failed.';
  status.style.color = 'var(--red)';
  addLog(`ERROR: ${msg}`, 'error', mode);
  showErrorPopup(msg, mode === 'uninstall' ? 'Uninstall Error' : 'Installation Error');
}

function resetProgress(mode) {
  const ids = activeIdsFor(mode);
  $(ids.fill).style.width = '0%';
  $(ids.pct).textContent = '0%';
  $(ids.log).textContent = '';
  $(ids.status).style.color = '';
}

async function init() {
  startBgAnimation();

  installPath = await window.api.defaultPath();
  $('install-path').value = installPath;
  refreshInstalledInfo().then(info => {
    if (info.installed) showInstalledWarning(info);
  }).catch(() => {});
  refreshUninstallInfo().catch(() => {});

  $('btn-min').addEventListener('click', () => window.api.minimize());
  $('btn-close').addEventListener('click', () => window.api.close());
  $('ep-close').addEventListener('click', hideErrorPopup);

  $('btn-cancel-0').addEventListener('click', () => window.api.close());
  $('btn-next-0').addEventListener('click', () => goTo(1, 'install'));
  $('btn-uninstall').addEventListener('click', prepareUninstall);

  $('btn-browse').addEventListener('click', async () => {
    const chosen = await window.api.browse();
    if (chosen) {
      installPath = chosen;
      $('install-path').value = chosen;
      $('path-error').classList.add('hidden');
      installWarningDismissed = false;
      const info = await refreshInstalledInfo(chosen);
      if (info.installed) showInstalledWarning(info);
      refreshUninstallInfo().catch(() => {});
    }
  });

  $('install-path').addEventListener('input', e => {
    installPath = e.target.value;
    installWarningDismissed = false;
  });
  $('btn-back-1').addEventListener('click', () => goTo(0, 'install'));
  $('btn-install').addEventListener('click', startInstall);

  window.api.onProgress(({ percent, message }) => setProgress(percent, message, 'install'));
  window.api.onLog(msg => addLog(msg, '', 'install'));
  window.api.onError(err => handleError(err, 'install'));
  window.api.onComplete(({ installPath: p }) => {
    completedPath = p;
    $('complete-path').textContent = p;
    setTimeout(() => goTo(3, 'install'), 700);
  });

  window.api.onUninstallProgress(({ percent, message }) => setProgress(percent, message, 'uninstall'));
  window.api.onUninstallLog(msg => addLog(msg, '', 'uninstall'));
  window.api.onUninstallError(err => handleError(err, 'uninstall'));
  window.api.onUninstallComplete(({ installPath: p }) => {
    uninstallPath = p;
    $('uninstall-complete-path').textContent = p;
    setTimeout(() => goTo(3, 'uninstall'), 700);
  });

  $('btn-launch').addEventListener('click', () => { window.api.launch(completedPath); window.api.close(); });
  $('btn-folder').addEventListener('click', () => window.api.openFolder(completedPath));
  $('btn-finish').addEventListener('click', () => window.api.close());
  $('btn-uninstall-finish').addEventListener('click', () => window.api.closeAfterUninstall());
}

async function prepareUninstall() {
  const info = await refreshUninstallInfo();
  if (!info.installed) {
    showUpdatePopup({
      title: 'Nothing to Uninstall',
      message: 'ESS Server Controller is not installed at the detected location. No files will be removed.',
      primaryText: 'OK',
      secondaryText: 'Close',
      onPrimary: hideUpdatePopup,
      onSecondary: hideUpdatePopup,
    });
    return;
  }

  showUpdatePopup({
    title: 'Uninstall ESS Server Controller?',
    message: 'This will remove ESS Server Controller, shortcuts, startup entries, uninstall registry entries, app registry entries, and installed application files.',
    mode: 'danger',
    primaryText: 'Continue to Uninstall',
    secondaryText: 'Cancel',
    onPrimary: () => {
      hideUpdatePopup();
      beginUninstall(info.installPath);
    },
    onSecondary: hideUpdatePopup,
  });
}

function beginUninstall(targetPath) {
  setStepperMode('uninstall');
  resetProgress('uninstall');
  goTo(2, 'uninstall');
  setProgress(0, 'Preparing uninstall...', 'uninstall');
  addLog('Uninstall started...', '', 'uninstall');
  window.api.startUninstall({ installPath: targetPath });
}

async function startInstall() {
  const trimmed = installPath.trim();
  if (!trimmed) { showPathError('Please select an installation folder.'); return; }
  const { ok, error } = await window.api.validatePath(trimmed);
  if (!ok) { showPathError(error); return; }

  const opts = buildInstallOptions(trimmed);
  const info = await refreshInstalledInfo(trimmed);
  if (info.installed && !installWarningDismissed) {
    pendingInstallOptions = opts;
    showInstalledWarning(info);
    return;
  }

  beginInstall(opts);
}

function buildInstallOptions(pathOverride = installPath.trim()) {
  return {
    installPath: pathOverride,
    desktopShortcut: $('opt-desktop').checked,
    startMenuShortcut: $('opt-startmenu').checked,
    openAfterInstall: $('opt-open').checked,
    startWithWindows: $('opt-startup').checked,
  };
}

function beginInstall(opts) {
  setStepperMode('install');
  resetProgress('install');
  goTo(2, 'install');
  setProgress(0, 'Starting installation...', 'install');
  addLog('Installation started...', '', 'install');
  window.api.startInstall(opts);
}

function showPathError(msg) {
  const el = $('path-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

document.addEventListener('DOMContentLoaded', init);
