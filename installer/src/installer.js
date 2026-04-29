'use strict';

// ── State ──────────────────────────────────────────────────────────────────
let currentStep   = 0;
let installPath   = '';
let completedPath = '';

const $ = id => document.getElementById(id);

// ── Canvas background animation ────────────────────────────────────────────
function startBgAnimation() {
  const canvas = $('bg-canvas');
  const ctx    = canvas.getContext('2d');

  function resize() {
    canvas.width  = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  // Three orbs: blue, purple, cyan
  const orbs = [
    { x: 0.75, y: 0.15, r: 260, color: [59,  130, 246], speed: 0.0006, ox: 0,   oy: 0   },
    { x: 0.20, y: 0.78, r: 210, color: [124,  58, 237], speed: 0.0004, ox: 1.5, oy: 0.9 },
    { x: 0.50, y: 0.45, r: 170, color: [6,   182, 212], speed: 0.0003, ox: 3.2, oy: 2.1 },
  ];

  // Grid
  const GRID = 44;

  let t = 0;

  function draw() {
    t++;
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    // ── solid base ──────────────────────────────────────────────────────
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);

    // ── scrolling dot grid ──────────────────────────────────────────────
    const gOff = (t * 0.35) % GRID;
    ctx.strokeStyle = 'rgba(59,130,246,0.06)';
    ctx.lineWidth   = 1;
    for (let x = -GRID + gOff; x < W + GRID; x += GRID) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = -GRID + gOff; y < H + GRID; y += GRID) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // ── animated glowing orbs ───────────────────────────────────────────
    for (const orb of orbs) {
      const cx = (orb.x + 0.14 * Math.sin(t * orb.speed       + orb.ox)) * W;
      const cy = (orb.y + 0.12 * Math.cos(t * orb.speed * 0.7 + orb.oy)) * H;
      const r  = orb.r * (1 + 0.06 * Math.sin(t * orb.speed * 1.3 + orb.oy));

      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0,   `rgba(${orb.color.join(',')},0.22)`);
      grad.addColorStop(0.4, `rgba(${orb.color.join(',')},0.10)`);
      grad.addColorStop(1,   `rgba(${orb.color.join(',')},0.00)`);

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── vignette ────────────────────────────────────────────────────────
    const vig = ctx.createRadialGradient(W/2, H/2, H * 0.2, W/2, H/2, H * 0.85);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);

    requestAnimationFrame(draw);
  }

  requestAnimationFrame(draw);
}

// ── Button ripple ──────────────────────────────────────────────────────────
document.addEventListener('click', e => {
  const btn = e.target.closest('.btn');
  if (!btn || btn.disabled) return;
  const rect   = btn.getBoundingClientRect();
  const ripple = document.createElement('span');
  ripple.className = 'ripple';
  ripple.style.left = `${e.clientX - rect.left}px`;
  ripple.style.top  = `${e.clientY - rect.top}px`;
  btn.appendChild(ripple);
  setTimeout(() => ripple.remove(), 600);
});

// ── Animated error popup ───────────────────────────────────────────────────
function showErrorPopup(msg) {
  $('ep-msg').textContent = msg;
  const overlay = $('error-overlay');
  overlay.classList.remove('hidden');
  const popup = $('error-popup');
  popup.style.animation = 'none';
  void popup.offsetWidth;
  popup.style.animation = '';
}
function hideErrorPopup() { $('error-overlay').classList.add('hidden'); }

// ── Step navigation ────────────────────────────────────────────────────────
function goTo(step) {
  const pages = ['page-0','page-1','page-2','page-3'];
  const rows  = ['sr-0',  'sr-1',  'sr-2',  'sr-3'];

  const cur = $(pages[currentStep]);
  cur.classList.add('slide-out');
  setTimeout(() => { cur.classList.add('hidden'); cur.classList.remove('slide-out'); }, 300);

  const next = $(pages[step]);
  next.style.transition = 'none';
  next.classList.remove('hidden');
  next.style.opacity   = '0';
  next.style.transform = 'translateX(32px) scale(.98)';
  next.style.filter    = 'blur(3px)';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    next.style.transition = '';
    next.style.opacity    = '';
    next.style.transform  = '';
    next.style.filter     = '';
  }));

  rows.forEach((id, i) => {
    const el = $(id);
    el.classList.remove('active','done');
    if (i < step)       el.classList.add('done');
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

function handleError(msg) {
  const status = $('install-status');
  status.textContent = 'Installation failed.';
  status.style.color = 'var(--red)';
  addLog(`ERROR: ${msg}`, 'error');
  showErrorPopup(msg);
}

// ── Init ──────────────────────────────────────────────────────────────────
async function init() {
  startBgAnimation();

  installPath = await window.api.defaultPath();
  $('install-path').value = installPath;

  $('btn-min').addEventListener('click',   () => window.api.minimize());
  $('btn-close').addEventListener('click', () => window.api.close());
  $('ep-close').addEventListener('click',  hideErrorPopup);

  $('btn-cancel-0').addEventListener('click', () => window.api.close());
  $('btn-next-0').addEventListener('click',   () => goTo(1));

  $('btn-browse').addEventListener('click', async () => {
    const chosen = await window.api.browse();
    if (chosen) { installPath = chosen; $('install-path').value = chosen; $('path-error').classList.add('hidden'); }
  });
  $('install-path').addEventListener('input', e => { installPath = e.target.value; });
  $('btn-back-1').addEventListener('click', () => goTo(0));
  $('btn-install').addEventListener('click', startInstall);

  window.api.onProgress(({ percent, message }) => setProgress(percent, message));
  window.api.onLog(msg  => addLog(msg));
  window.api.onError(err => handleError(err));
  window.api.onComplete(({ installPath: p }) => {
    completedPath = p;
    $('complete-path').textContent = p;
    setTimeout(() => goTo(3), 700);
  });

  $('btn-launch').addEventListener('click', () => { window.api.launch(completedPath); window.api.close(); });
  $('btn-folder').addEventListener('click', () => window.api.openFolder(completedPath));
  $('btn-finish').addEventListener('click', () => window.api.close());
}

async function startInstall() {
  const trimmed = installPath.trim();
  if (!trimmed) { showPathError('Please select an installation folder.'); return; }
  const { ok, error } = await window.api.validatePath(trimmed);
  if (!ok) { showPathError(error); return; }

  const opts = {
    installPath:       trimmed,
    desktopShortcut:   $('opt-desktop').checked,
    startMenuShortcut: $('opt-startmenu').checked,
    openAfterInstall:  $('opt-open').checked,
    startWithWindows:  $('opt-startup').checked,
  };

  goTo(2);
  setProgress(0, 'Starting installation…');
  addLog('Installation started…');
  window.api.startInstall(opts);
}

function showPathError(msg) {
  const el = $('path-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

document.addEventListener('DOMContentLoaded', init);
