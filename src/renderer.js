const state = {
  app: null,
  servers: [],
  github: { repos: [] },
  updates: null,
  logs: [],
  theme: "dark",
  notificationTimeout: 4500,
  startWithWindows: false,
  external: null,
  serverRenderSignature: "",
  websiteRenderSignature: ""
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

function statusLabel(status) {
  return String(status || "idle").replace(/[-_]+/g, " ");
}

function emptyState(title, message, compact = false) {
  return `
    <div class="empty-state ${compact ? "compact" : ""}">
      <div>
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(message)}</span>
      </div>
    </div>
  `;
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
    <button type="button" title="Close">&times;</button>
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
  const settingsButton = $(".sidebar-settings");
  if (settingsButton) settingsButton.classList.toggle("active", page === "settings");
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
  $("#sidebarOnlineCount").textContent = `${running} ${running === 1 ? "server" : "servers"} online`;
}

function renderServerSummary() {
  $("#dashboardServers").innerHTML = state.servers.length ? state.servers.map((server) => `
    <div class="summary-row">
      <div>
        <strong>${escapeHtml(server.name)}</strong>
        <small>${escapeHtml(server.message || server.type)}</small>
      </div>
      <span class="status-pill ${statusClass(server.status)}">${escapeHtml(statusLabel(server.status))}</span>
    </div>
  `).join("") : emptyState("No server profiles", "Add or configure server profiles in Settings to begin managing processes.", true);
}

function renderServerCard(server) {
  const disabledStart = server.command ? "" : "disabled";
  const isRunning = server.status === "running";
  const statusText = statusLabel(server.status);
  const serverInitials = String(server.name || "SV").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const commandText = server.command || "No launch command configured";
  return `
    <article class="server-card server-card-${statusClass(server.status)}">
      <div class="server-main">
        <div class="server-avatar">${escapeHtml(serverInitials)}</div>
        <div class="server-title-group">
          <div class="server-title-line">
            <h3>${escapeHtml(server.name)}</h3>
            <span class="status-pill ${statusClass(server.status)}">${escapeHtml(statusText)}</span>
          </div>
          <p>${escapeHtml(server.type)} / ${escapeHtml(server.message || "Ready")}</p>
          <div class="server-command-line">${escapeHtml(commandText)}</div>
        </div>
      </div>
      <div class="server-signal">
        <span class="health-orbit ${isRunning ? "is-live" : ""}"></span>
        <strong>${isRunning ? "Live" : "Offline"}</strong>
      </div>
      <div class="server-card-stats">
        <div><span>PID</span><strong>${server.pid || "None"}</strong></div>
        <div><span>Uptime</span><strong>${escapeHtml(server.uptime || "0s")}</strong></div>
      </div>
      <div class="detail-row server-root"><span>Root</span><span class="path-text">${escapeHtml(shortPath(server.rootPath))}</span></div>
      <div class="card-actions">
        <button class="primary-btn action-start" data-start="${server.id}" ${disabledStart}>Start</button>
        <button class="ghost-btn action-stop" data-stop="${server.id}">Stop</button>
        <button class="ghost-btn action-restart" data-restart="${server.id}" ${disabledStart}>Restart</button>
        <button class="ghost-btn action-folder" data-folder="${escapeHtml(server.rootPath)}">Open Folder</button>
        <button class="ghost-btn action-logs" data-go="logs">Logs</button>
      </div>
    </article>
  `;
}

function renderServers() {
  const servers = state.servers.filter((server) => server.id !== "website");
  const websites = state.servers.filter((server) => server.id === "website");
  const running = servers.filter((server) => server.status === "running").length;
  const onlineHero = $("#serversOnlineHero");
  const totalHero = $("#serversTotalHero");
  if (onlineHero) onlineHero.textContent = running;
  if (totalHero) totalHero.textContent = servers.length;
  const serverSignature = JSON.stringify(servers.map((server) => ({
    id: server.id,
    name: server.name,
    type: server.type,
    status: server.status,
    message: server.message,
    rootPath: server.rootPath,
    pid: server.pid,
    uptime: server.uptime,
    command: server.command
  })));
  const websiteSignature = JSON.stringify(websites.map((server) => ({
    id: server.id,
    name: server.name,
    type: server.type,
    status: server.status,
    message: server.message,
    rootPath: server.rootPath,
    pid: server.pid,
    uptime: server.uptime,
    command: server.command
  })));
  if (serverSignature !== state.serverRenderSignature) {
    $("#serverCards").innerHTML = servers.length
      ? servers.map(renderServerCard).join("")
      : emptyState("No servers configured", "Server entries will appear here after they are added to your controller configuration.");
    state.serverRenderSignature = serverSignature;
  }
  if (websiteSignature !== state.websiteRenderSignature) {
    $("#websiteCards").innerHTML = websites.length
      ? websites.map(renderServerCard).join("")
      : emptyState("No website profile", "Website management uses the same launch controls once a website profile is configured.");
    state.websiteRenderSignature = websiteSignature;
  }
}

function renderGithub() {
  $("#githubEnabled").checked = Boolean(state.github.enabled);
  const repos = state.github.repos || [];
  $("#repoGrid").innerHTML = repos.length ? repos.map((repo) => `
    <article class="repo-card">
      <div class="repo-head">
        <div>
          <h3>${escapeHtml(repo.name)}</h3>
          <p>${escapeHtml(shortPath(repo.path))}</p>
        </div>
        <span class="status-pill ${statusClass(repo.status)}">${escapeHtml(statusLabel(repo.status))}</span>
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
  `).join("") : emptyState("No repositories watched", "Add a Git repository to enable update scans, commit comparison, and pull controls.");
}

function renderLogs() {
  const lines = state.logs.slice(-500).map((entry) => {
    const details = entry.details ? ` ${typeof entry.details === "string" ? entry.details : JSON.stringify(entry.details)}` : "";
    return `[${new Date(entry.timestamp).toLocaleString()}] [${entry.level.toUpperCase()}] [${entry.category}] ${entry.message}${details}`;
  });
  const viewer = $("#logViewer");
  viewer.textContent = lines.length ? lines.join("\n") : "No events yet. Logs will stream here as servers, websites, updates, and GitHub tasks run.";
  viewer.scrollTop = viewer.scrollHeight;
  const recent = state.logs.slice(-6).reverse();
  $("#recentEvents").innerHTML = recent.length ? recent.map((entry) => `
    <div class="event-row">
      <div>
        <strong>${escapeHtml(entry.message)}</strong>
        <small>${escapeHtml(entry.category)} / ${formatTime(entry.timestamp)}</small>
      </div>
      <span class="status-pill ${statusClass(entry.level)}">${escapeHtml(statusLabel(entry.level))}</span>
    </div>
  `).join("") : emptyState("No recent events", "Activity from the controller will appear here as it happens.", true);
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
  $("#settingsServers").innerHTML = state.servers.length ? state.servers.map((server) => `
    <div class="settings-server" data-settings-server="${server.id}">
      <input value="${escapeHtml(server.name)}" data-field="name" />
      <input value="${escapeHtml(server.rootPath || "")}" data-field="rootPath" />
      <input value="${escapeHtml(server.command || "")}" data-field="command" placeholder="Launch command" />
    </div>
  `).join("") : emptyState("No editable profiles", "Server configuration rows will appear here after profiles are available.");
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
  const systemChip = $("#systemChip");
  if (systemChip) {
    systemChip.textContent = system ? `${system.hostname} / ${system.memory.usedPercent}% RAM` : "System loading";
  }
  const version = state.app?.version || state.updates?.currentVersion || "1.0.0";
  const sidebarVersion = $("#sidebarVersion");
  if (sidebarVersion) sidebarVersion.textContent = `v${String(version).replace(/^v/i, "")}`;
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

  const themeToggle = $("#themeToggle");
  if (themeToggle) {
    themeToggle.addEventListener("click", async () => {
      const next = state.theme === "dark" ? "light" : "dark";
      setTheme(next);
      await safeAction(() => window.essApi.setTheme(next));
    });
  }

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
