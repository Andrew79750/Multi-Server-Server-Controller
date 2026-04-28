'use strict';

// ── State ──────────────────────────────────────────────────────────────────
let currentStep   = 0;
let installPath   = '';
let completedPath = '';

// ── DOM helpers ────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ── Step navigation ────────────────────────────────────────────────────────
function goTo(step) {
  const pages = ['page-0', 'page-1', 'page-2', 'page-3'];
  const rows  = ['sr-0',   'sr-1',   'sr-2',   'sr-3'];

  // Slide out current
  const cur = $(pages[currentStep]);
  cur.classList.add('slide-out');
  setTimeout(() => {
    cur.classList.add('hidden');
    cur.classList.remove('slide-out');
  }, 250);

  // Slide in next
  const next = $(pages[step]);
  next.classList.remove('hidden');
  next.style.opacity = '0';
  next.style.transform = 'translateX(24px)';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      next.style.opacity = '';
      next.style.transform = '';
    });
  });

  // Update sidebar
  rows.forEach((id, i) => {
    const el = $(id);
    el.classList.remove('active', 'done');
    if (i < step)      el.classList.add('done');
    else if (i === step) el.classList.add('active');
  });

  currentStep = step;
}

// ── Progress & log ─────────────────────────────────────────────────────────
function setProgress(pct, msg) {
  $('progress-fill').style.width = `${pct}%`;
  $('progress-pct').textContent  = `${Math.round(pct)}%`;
  if (msg) $('install-status').textContent = msg;
}

function addLog(msg, type = '') {
  const panel = $('log-panel');
  const line  = document.createElement('div');
  line.className = `log-line ${type}`;
  line.textContent = `› ${msg}`;
  panel.appendChild(line);
  panel.scrollTop = panel.scrollHeight;
}

function showInstallError(msg) {
  const box = $('install-error-box');
  $('install-error-text').textContent = msg;
  box.classList.remove('hidden');
  $('install-status').textContent = 'Installation failed.';
  $('install-status').style.color = 'var(--red)';
  addLog(`ERROR: ${msg}`, 'error');
}

// ── Init ──────────────────────────────────────────────────────────────────
async function init() {
  // Load default path
  installPath = await window.api.defaultPath();
  $('install-path').value = installPath;

  // Title bar
  $('btn-min').addEventListener('click',   () => window.api.minimize());
  $('btn-close').addEventListener('click', () => window.api.close());

  // Step 0 — Welcome
  $('btn-cancel-0').addEventListener('click', () => window.api.close());
  $('btn-next-0').addEventListener('click',   () => goTo(1));

  // Step 1 — Options
  $('btn-browse').addEventListener('click', async () => {
    const chosen = await window.api.browse();
    if (chosen) {
      installPath = chosen;
      $('install-path').value = chosen;
      $('path-error').classList.add('hidden');
    }
  });

  $('install-path').addEventListener('input', e => {
    installPath = e.target.value;
  });

  $('btn-back-1').addEventListener('click', () => goTo(0));
  $('btn-install').addEventListener('click', startInstall);

  // Step 2 — IPC listeners (wire once)
  window.api.onProgress(({ percent, message }) => setProgress(percent, message));
  window.api.onLog(msg => addLog(msg));
  window.api.onError(err => showInstallError(err));
  window.api.onComplete(({ installPath: p }) => {
    completedPath = p;
    $('complete-path').textContent = p;
    setTimeout(() => goTo(3), 600);
  });

  // Step 3 — Complete
  $('btn-launch').addEventListener('click', () => {
    window.api.launch(completedPath);
    window.api.close();
  });
  $('btn-folder').addEventListener('click', () => window.api.openFolder(completedPath));
  $('btn-finish').addEventListener('click', () => window.api.close());
}

async function startInstall() {
  // Validate path
  const trimmed = installPath.trim();
  if (!trimmed) {
    showPathError('Please select an installation folder.');
    return;
  }
  const { ok, error } = await window.api.validatePath(trimmed);
  if (!ok) {
    showPathError(error);
    return;
  }

  // Collect options
  const opts = {
    installPath:      trimmed,
    desktopShortcut:  $('opt-desktop').checked,
    startMenuShortcut:$('opt-startmenu').checked,
    openAfterInstall: $('opt-open').checked,
    startWithWindows: $('opt-startup').checked,
  };

  // Move to installing step
  goTo(2);
  setProgress(0, 'Starting installation…');
  addLog('Installation started…');

  // Fire & forget — controller emits IPC events back
  window.api.startInstall(opts);
}

function showPathError(msg) {
  const el = $('path-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

// ── Boot ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
