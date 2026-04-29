const state = {
  app: null,
  servers: [],
  github: { repos: [] },
  updates: null,
  logs: [],
  theme: "dark",
  notificationTimeout: 4500,
  startWithWindows: false,
  external: null
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[char]));
}

function statusClass(status) {
  return `status-${String(status || "idle").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
}

function formatTime(value) {
  if (!value) return "Never";
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDateTime(value) {
  if (!value) return "Never";
  return new Date(value).toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function shortPath(value) {
  if (!value) return "Not configured";
  return value.length > 74 ? `...${value.slice(-71)}` : value;
}

function showToast(type, message, details = "") {
  const container = $("#toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast ${type || "info"}`;
  toast.innerHTML = `
    <div>
      <strong>${escapeHtml(message)}</strong>
      ${details ? `<small>${escapeHtml(details)}</small>` : ""}
    </div>
    <button type="button" title="Close">x</button>
  `;
  const close = () => toast.remove();
  toast.querySelector("button").addEventListener("click", close);
  container.appendChild(toast);
  setTimeout(close, state.notificationTimeout || 4500);
}

function getReleaseAssetUrl(updateState) {
  const assets = updateState?.assets || [];
  const setup = assets.find((asset) => /setup.*\.exe$/i.test(asset.name));
  const exe = assets.find((asset) => /\.exe$/i.test(asset.name));
  return (setup || exe || assets[0])?.url || updateState?.releaseUrl;
}

async function safeAction(action, successMessage) {
  try {
    const result = await action();
    if (successMessage) showToast("success", successMessage);
    return result;
  } catch (error) {
    showToast("error", "Action failed", error.message);
    return null;
  }
}

function setTheme(theme) {
  state.theme = theme || "dark";
  document.documentElement.dataset.theme = state.theme;
  $("#settingsTheme").value = state.theme;
}

function setPage(page) {
  $$(".nav-btn").forEach((btn) => btn.classList.toggle("active", btn.dataset.page === page));
  $$(".page").forEach((section) => section.classList.toggle("active", section.id === `page-${page}`));
  $("#pageTitle").textContent = page.charAt(0).toUpperCase() + page.slice(1);
}

function renderMetrics() {
  const running = state.servers.filter((server) => server.status === "running").length;
  const repos = state.github.repos || [];
  const updates = repos.filter((repo) => repo.updateAvailable).length;
  const errors = [...repos, ...state.servers].filter((item) => item.status === "error").length;
  const memory = state.app?.system?.memory;
  $("#dashboardMetrics").innerHTML = [
    ["Servers Running", `${running}/${state.servers.length}`],
    ["GitHub Updates", updates],
    ["System Memory", memory ? `${memory.usedPercent}%` : "Loading"],
    ["Active Warnings", errors]
  ].map(([label, value]) => `
    <article class="metric-card">
      <span>${label}</span>
      <strong>${value}</strong>
    </article>
  `).join("");
}

function renderServerSummary() {
  $("#dashboardServers").innerHTML = state.servers.map((server) => `
    <div class="summary-row">
      <div>
        <strong>${escapeHtml(server.name)}</strong>
        <small>${escapeHtml(server.message || server.type)}</small>
      </div>
      <span class="status-pill ${statusClass(server.status)}">${escapeHtml(server.status)}</span>
    </div>
  `).join("");
}

function renderServerCard(server) {
  const disabledStart = server.command ? "" : "disabled";
  return `
    <article class="server-card">
      <div class="card-head">
        <div>
          <h3>${escapeHtml(server.name)}</h3>
          <p>${escapeHtml(server.type)} / ${escapeHtml(server.message || "Ready")}</p>
        </div>
        <span class="status-pill ${statusClass(server.status)}">${escapeHtml(server.status)}</span>
      </div>
      <div class="detail-row"><span>Root</span><span class="path-text">${escapeHtml(shortPath(server.rootPath))}</span></div>
      <div class="detail-row"><span>PID</span><span>${server.pid || "None"}</span></div>
      <div class="detail-row"><span>Uptime</span><span>${escapeHtml(server.uptime || "0s")}</span></div>
      <div class="card-actions">
        <button class="primary-btn" data-start="${server.id}" ${disabledStart}>Start</button>
        <button class="ghost-btn" data-stop="${server.id}">Stop</button>
        <button class="ghost-btn" data-restart="${server.id}" ${disabledStart}>Restart</button>
        <button class="ghost-btn" data-folder="${escapeHtml(server.rootPath)}">Open Folder</button>
        <button class="ghost-btn" data-go="logs">Logs</button>
      </div>
    </article>
  `;
}

function renderServers() {
  const servers = state.servers.filter((server) => server.id !== "website");
  const websites = state.servers.filter((server) => server.id === "website");
  $("#serverCards").innerHTML = servers.map(renderServerCard).join("");
  $("#websiteCards").innerHTML = websites.map(renderServerCard).join("");
}

function renderGithub() {
  $("#githubEnabled").checked = Boolean(state.github.enabled);
  $("#repoGrid").innerHTML = (state.github.repos || []).map((repo) => `
    <article class="repo-card">
      <div class="repo-head">
        <div>
          <h3>${escapeHtml(repo.name)}</h3>
          <p>${escapeHtml(shortPath(repo.path))}</p>
        </div>
        <span class="status-pill ${statusClass(repo.status)}">${escapeHtml(repo.status)}</span>
      </div>
      <label class="switch-row">
        <input type="checkbox" data-repo-enabled="${repo.id}" ${repo.enabled ? "checked" : ""} />
        <span class="switch"></span>
        Enabled
      </label>
      <div class="detail-row"><span>Branch</span><span>${escapeHtml(repo.branch || "unknown")}</span></div>
      <div class="detail-row"><span>Local</span><span>${escapeHtml(repo.localCommit || "unknown")}</span></div>
      <div class="detail-row"><span>Remote</span><span>${escapeHtml(repo.remoteCommit || "unknown")}</span></div>
      <div class="detail-row"><span>Last checked</span><span>${formatTime(repo.lastChecked)}</span></div>
      <div class="detail-row"><span>Last pulled</span><span>${formatTime(repo.lastPulled)}</span></div>
      ${repo.error ? `<div class="detail-row"><span>Error</span><span class="path-text">${escapeHtml(repo.error)}</span></div>` : ""}
      <div class="card-actions">
        <button class="primary-btn" data-pull="${repo.id}">Pull</button>
        <button class="danger-btn" data-remove-repo="${repo.id}">Remove</button>
      </div>
    </article>
  `).join("");
}

function renderLogs() {
  const lines = state.logs.slice(-500).map((entry) => {
    const details = entry.details ? ` ${typeof entry.details === "string" ? entry.details : JSON.stringify(entry.details)}` : "";
    return `[${new Date(entry.timestamp).toLocaleString()}] [${entry.level.toUpperCase()}] [${entry.category}] ${entry.message}${details}`;
  });
  const viewer = $("#logViewer");
  viewer.textContent = lines.join("\n");
  viewer.scrollTop = viewer.scrollHeight;
  $("#recentEvents").innerHTML = state.logs.slice(-6).reverse().map((entry) => `
    <div class="event-row">
      <div>
        <strong>${escapeHtml(entry.message)}</strong>
        <small>${escapeHtml(entry.category)} / ${formatTime(entry.timestamp)}</small>
      </div>
      <span class="status-pill ${statusClass(entry.level)}">${escapeHtml(entry.level)}</span>
    </div>
  `).join("");
}

function renderSettings() {
  $("#settingsTheme").value = state.theme;
  $("#notificationTimeout").value = state.notificationTimeout || 4500;
  $("#fetchCooldown").value = state.github.fetchCooldownSeconds || 30;
  $("#pullOnUpdate").checked = Boolean(state.github.pullOnUpdate);
  $("#startWithWindows").checked = Boolean(state.startWithWindows);
  const updates = state.updates || {};
  const updateSettings = updates.settings || {};
  $("#currentVersionPill").textContent = `v${state.app?.version || updates.currentVersion || "0.0.0"}`;
  $("#lastUpdateCheck").textContent = formatDateTime(updates.lastChecked);
  $("#latestUpdateVersion").textContent = updates.latestVersion ? `v${updates.latestVersion}` : "Unknown";
  $("#updatesEnabled").checked = updateSettings.enabled !== false;
  $("#checkUpdatesOnStartup").checked = updateSettings.checkOnStartup !== false;
  $("#notifyOnUpdate").checked = updateSettings.notifyOnUpdate !== false;
  $("#updateInterval").value = updateSettings.checkIntervalMinutes || 30;
  $("#externalRootPath").textContent = shortPath(state.external?.rootPath);
  $("#settingsServers").innerHTML = state.servers.map((server) => `
    <div class="settings-server" data-settings-server="${server.id}">
      <input value="${escapeHtml(server.name)}" data-field="name" />
      <input value="${escapeHtml(server.rootPath || "")}" data-field="rootPath" />
      <input value="${escapeHtml(server.command || "")}" data-field="command" placeholder="Launch command" />
    </div>
  `).join("");
}

function renderUpdateModal(updateState) {
  if (!updateState?.updateAvailable) return;
  state.updates = updateState;
  $("#modalCurrentVersion").textContent = `Current v${updateState.currentVersion}`;
  $("#modalLatestVersion").textContent = `New v${updateState.latestVersion}`;
  $("#modalReleaseTitle").textContent = updateState.releaseName || updateState.tagName || "Latest release";
  $("#modalPublishedDate").textContent = `Published ${formatDateTime(updateState.publishedAt)}`;
  const changelog = updateState.changelog?.trim() || "No release notes were provided for this version.";
  $("#modalChangelog").textContent = changelog;
  $("#downloadUpdate").disabled = !getReleaseAssetUrl(updateState);
  $("#updateModal").classList.add("open");
  $("#updateModal").setAttribute("aria-hidden", "false");
}

function closeUpdateModal() {
  $("#updateModal").classList.remove("open");
  $("#updateModal").setAttribute("aria-hidden", "true");
}

function renderSystem() {
  const system = state.app?.system;
  $("#systemChip").textContent = system ? `${system.hostname} / ${system.memory.usedPercent}% RAM` : "System loading";
}

function renderAll() {
  renderSystem();
  renderMetrics();
  renderServerSummary();
  renderServers();
  renderGithub();
  renderLogs();
  renderSettings();
}

async function refreshLogs() {
  state.logs = await window.essApi.getLogs($("#logFilter").value);
  renderLogs();
}

function bindEvents() {
  $$(".nav-btn").forEach((btn) => btn.addEventListener("click", () => setPage(btn.dataset.page)));
  document.body.addEventListener("click", async (event) => {
    const target = event.target.closest("button");
    if (!target) return;
    if (target.dataset.go) setPage(target.dataset.go);
    if (target.dataset.start) await safeAction(() => window.essApi.startServer(target.dataset.start));
    if (target.dataset.stop) await safeAction(() => window.essApi.stopServer(target.dataset.stop));
    if (target.dataset.restart) await safeAction(() => window.essApi.restartServer(target.dataset.restart));
    if (target.dataset.folder) await safeAction(() => window.essApi.openFolder(target.dataset.folder), "Folder opened");
    if (target.dataset.pull) await safeAction(() => window.essApi.githubPullRepo(target.dataset.pull));
    if (target.dataset.removeRepo) {
      state.github = await window.essApi.githubRemoveRepo(target.dataset.removeRepo);
      renderGithub();
    }
  });

  $("#themeToggle").addEventListener("click", async () => {
    const next = state.theme === "dark" ? "light" : "dark";
    setTheme(next);
    await safeAction(() => window.essApi.setTheme(next));
  });

  $("#createDesktopShortcut").addEventListener("click", async () => {
    await safeAction(() => window.essApi.createDesktopShortcut(), "Desktop shortcut created");
  });

  $("#openInstallFolder").addEventListener("click", async () => {
    await safeAction(() => window.essApi.openInstallFolder(), "Install folder opened");
  });

  $("#openExternalRoot").addEventListener("click", async () => {
    await safeAction(() => window.essApi.openExternalRoot(), "External files opened");
  });

  $("#startWithWindows").addEventListener("change", async (event) => {
    const result = await safeAction(() => window.essApi.setStartWithWindows(event.target.checked), "Startup setting saved");
    state.startWithWindows = Boolean(result);
    $("#startWithWindows").checked = state.startWithWindows;
  });

  $("#githubEnabled").addEventListener("change", async (event) => {
    await safeAction(() => window.essApi.saveSettings({ github: { enabled: event.target.checked } }), "GitHub setting saved");
  });

  $("#githubCheckNow").addEventListener("click", async () => {
    state.github = await safeAction(() => window.essApi.githubCheckNow()) || state.github;
    renderGithub();
  });

  $("#githubAddRepo").addEventListener("click", async () => {
    state.github = await safeAction(() => window.essApi.githubAddRepo()) || state.github;
    renderGithub();
  });

  document.body.addEventListener("change", async (event) => {
    const enabled = event.target.closest("[data-repo-enabled]");
    if (enabled) {
      state.github = await safeAction(() => window.essApi.githubSetEnabled(enabled.dataset.repoEnabled, enabled.checked)) || state.github;
      renderGithub();
    }
  });

  $("#logFilter").addEventListener("change", refreshLogs);
  $("#clearLogs").addEventListener("click", async () => {
    state.logs = await safeAction(() => window.essApi.clearLogs()) || [];
    renderLogs();
  });
  $("#exportLogs").addEventListener("click", () => {
    const blob = new Blob([$("#logViewer").textContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ess-server-controller-${Date.now()}.log`;
    link.click();
    URL.revokeObjectURL(url);
  });

  $("#saveSettings").addEventListener("click", async () => {
    const servers = $$("#settingsServers .settings-server").map((row) => {
      const existing = state.servers.find((server) => server.id === row.dataset.settingsServer);
      return {
        ...existing,
        name: row.querySelector('[data-field="name"]').value,
        rootPath: row.querySelector('[data-field="rootPath"]').value,
        command: row.querySelector('[data-field="command"]').value
      };
    });
    const settings = {
      theme: $("#settingsTheme").value,
      notificationTimeout: Number($("#notificationTimeout").value || 4500),
      github: {
        fetchCooldownSeconds: Number($("#fetchCooldown").value || 30),
        pullOnUpdate: $("#pullOnUpdate").checked
      },
      appUpdates: {
        enabled: $("#updatesEnabled").checked,
        checkOnStartup: $("#checkUpdatesOnStartup").checked,
        notifyOnUpdate: $("#notifyOnUpdate").checked,
        checkIntervalMinutes: Number($("#updateInterval").value || 30)
      },
      servers
    };
    await safeAction(() => window.essApi.saveSettings(settings));
    setTheme(settings.theme);
    state.notificationTimeout = settings.notificationTimeout;
  });

  $("#checkForUpdates").addEventListener("click", async () => {
    const updates = await safeAction(() => window.essApi.checkForAppUpdate());
    if (!updates) return;
    state.updates = updates;
    renderSettings();
    if (updates.updateAvailable) renderUpdateModal(updates);
  });

  $("#viewGithubReleases").addEventListener("click", async () => {
    await safeAction(() => window.essApi.openExternal("https://github.com/Andrew79750/Multi-Server-Server-Controller/releases"), "Opening GitHub releases");
  });

  $("#closeUpdateModal").addEventListener("click", closeUpdateModal);
  $("#remindLater").addEventListener("click", closeUpdateModal);
  $("#updateModal").addEventListener("click", (event) => {
    if (event.target.id === "updateModal") closeUpdateModal();
  });
  $("#viewRelease").addEventListener("click", async () => {
    await safeAction(() => window.essApi.openExternal(state.updates?.releaseUrl));
  });
  $("#downloadUpdate").addEventListener("click", async () => {
    await safeAction(() => window.essApi.openExternal(getReleaseAssetUrl(state.updates)), "Opening update download");
  });
  $("#skipVersion").addEventListener("click", async () => {
    state.updates = await safeAction(() => window.essApi.skipUpdateVersion(state.updates?.latestVersion), "Version skipped") || state.updates;
    closeUpdateModal();
    renderSettings();
  });
}

async function init() {
  bindEvents();
  state.app = await window.essApi.getAppState();
  state.servers = state.app.servers || [];
  state.github = state.app.github || { repos: [] };
  state.updates = state.app.appUpdates || null;
  state.logs = state.app.logs || [];
  state.external = state.app.external || null;
  state.notificationTimeout = state.app.notificationTimeout || 4500;
  state.startWithWindows = Boolean(state.app.startWithWindows);
  setTheme(state.app.theme || "dark");
  renderAll();

  window.essApi.onLog((entry) => {
    state.logs.push(entry);
    state.logs = state.logs.slice(-1000);
    renderLogs();
  });
  window.essApi.onNotification((toast) => showToast(toast.type, toast.message, toast.details));
  window.essApi.onGithubState((github) => {
    state.github = github;
    renderGithub();
    renderMetrics();
  });
  window.essApi.onUpdateState((updates) => {
    state.updates = updates;
    renderSettings();
  });
  window.essApi.onUpdateAvailable((updates) => {
    state.updates = updates;
    renderSettings();
    renderUpdateModal(updates);
  });
  window.essApi.onServerState((servers) => {
    state.servers = servers;
    renderServers();
    renderServerSummary();
    renderMetrics();
  });
  window.essApi.onAppState((appState) => {
    state.app = appState;
    state.servers = appState.servers || state.servers;
    state.github = appState.github || state.github;
    state.updates = appState.appUpdates || state.updates;
    state.external = appState.external || state.external;
    state.notificationTimeout = appState.notificationTimeout || state.notificationTimeout;
    state.startWithWindows = Boolean(appState.startWithWindows);
    setTheme(appState.theme || state.theme);
    renderAll();
  });
  window.essApi.onLogsCleared(() => {
    state.logs = [];
    renderLogs();
  });
}

window.addEventListener("DOMContentLoaded", () => {
  init().catch((error) => {
    console.error(error);
    showToast("error", "Renderer failed to initialize", error.message);
  });
});
