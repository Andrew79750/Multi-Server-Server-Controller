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
  websiteRenderSignature: "",
  summaryRenderSignature: "",
  logViewerSignature: "",
  recentEventsSignature: ""
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

function iconSvg(name) {
  const icons = {
    server: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="5" rx="1.5"/><rect x="4" y="14" width="16" height="5" rx="1.5"/><path d="M8 7.5h.01"/><path d="M8 16.5h.01"/><path d="M12 7.5h4"/><path d="M12 16.5h4"/></svg>',
    github: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18c-3 1.4-3-1.4-4-2"/><path d="M17 22v-3.9a3.4 3.4 0 0 0-1-2.6c3.3-.4 6.7-1.6 6.7-7.2A5.6 5.6 0 0 0 21.2 4c.2-.5.7-2.1-.2-4 0 0-1.3-.4-4.3 1.6A14.8 14.8 0 0 0 12.8 1c-1.3 0-2.6.2-3.8.6C6 .6 4.7 1 4.7 1c-.9 1.9-.4 3.5-.2 4A5.6 5.6 0 0 0 3 8.3c0 5.6 3.4 6.8 6.7 7.2a3.4 3.4 0 0 0-1 2.6V22"/></svg>',
    memory: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 1v3"/><path d="M15 1v3"/><path d="M9 20v3"/><path d="M15 20v3"/><path d="M20 9h3"/><path d="M20 15h3"/><path d="M1 9h3"/><path d="M1 15h3"/></svg>',
    warning: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5"/><path d="M12 17h.01"/></svg>',
    activity: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13h4l2-7 4 14 2-7h4"/></svg>',
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'
  };
  return icons[name] || icons.activity;
}

function clampPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, number));
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

function serverConfigPayload(servers = state.servers) {
  return {
    app: "ESS Server Controller",
    type: "server-config",
    version: 1,
    exportedAt: new Date().toISOString(),
    servers: servers.map((server) => ({
      id: server.id,
      name: server.name,
      type: server.type,
      rootPath: server.rootPath || "",
      command: server.command || "",
      args: Array.isArray(server.args) ? server.args : [],
      enabled: server.enabled !== false
    }))
  };
}

function slugify(value) {
  return String(value || "server").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "server";
}

function uniqueServerId(name) {
  const base = slugify(name);
  const ids = new Set(state.servers.map((server) => server.id));
  let next = base;
  let index = 2;
  while (ids.has(next)) {
    next = `${base}-${index}`;
    index += 1;
  }
  return next;
}

function parseArgs(value) {
  return String(value || "").match(/(?:[^\s"]+|"[^"]*")+/g)?.map((part) => part.replace(/^"|"$/g, "")) || [];
}

function normalizeImportedServers(value) {
  const servers = Array.isArray(value) ? value : value?.servers;
  if (!Array.isArray(servers)) throw new Error("JSON must contain a servers array.");
  return servers.map((server, index) => {
    const name = String(server.name || "").trim();
    if (!name) throw new Error(`Server ${index + 1} is missing a name.`);
    return {
      id: slugify(server.id || name),
      name,
      type: String(server.type || "Server").trim(),
      rootPath: String(server.rootPath || "").trim(),
      command: String(server.command || "").trim(),
      args: Array.isArray(server.args) ? server.args.map(String) : parseArgs(server.args),
      enabled: server.enabled !== false
    };
  }).map((server, index, list) => {
    const duplicateCount = list.slice(0, index).filter((item) => item.id === server.id).length;
    return duplicateCount ? { ...server, id: `${server.id}-${duplicateCount + 1}` } : server;
  });
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
  const title = page.charAt(0).toUpperCase() + page.slice(1);
  $("#pageTitle").textContent = title;
  const titlebarTitle = $("#titlebarPageTitle");
  if (titlebarTitle) titlebarTitle.textContent = title;
}

function renderMetrics() {
  const running = state.servers.filter((server) => server.status === "running").length;
  const repos = state.github.repos || [];
  const updates = repos.filter((repo) => repo.updateAvailable).length;
  const errors = [...repos, ...state.servers].filter((item) => item.status === "error").length;
  const memory = state.app?.system?.memory;
  const serverTotal = state.servers.length || 0;
  const metricCards = [
    {
      label: "Servers Running",
      value: `${running}/${serverTotal}`,
      helper: serverTotal ? `${serverTotal - running} waiting for launch` : "No profiles configured",
      icon: "server",
      tone: running ? "good" : "warn",
      percent: serverTotal ? (running / serverTotal) * 100 : 0
    },
    {
      label: "GitHub Updates",
      value: updates,
      helper: updates ? "Updates need attention" : "Repositories are quiet",
      icon: "github",
      tone: updates ? "warn" : "good",
      percent: repos.length ? (updates / repos.length) * 100 : 0
    },
    {
      label: "System Memory",
      value: memory ? `${memory.usedPercent}%` : "Loading",
      helper: memory ? `${memory.freeGb} GB free of ${memory.totalGb} GB` : "Waiting for telemetry",
      icon: "memory",
      tone: memory && memory.usedPercent > 80 ? "danger" : "info",
      percent: memory ? memory.usedPercent : 0
    },
    {
      label: "Active Warnings",
      value: errors,
      helper: errors ? "Review recent events" : "No warnings detected",
      icon: "warning",
      tone: errors ? "danger" : "good",
      percent: errors ? Math.min(errors * 16, 100) : 0
    }
  ];
  const container = $("#dashboardMetrics");
  if (container.children.length !== metricCards.length) {
    container.innerHTML = metricCards.map((metric, index) => `
    <article class="metric-card metric-${metric.tone}" style="--metric-fill: 0%; --delay: ${index * 70}ms">
      <div class="metric-topline">
        <span>${escapeHtml(metric.label)}</span>
        <div class="metric-icon">${iconSvg(metric.icon)}</div>
      </div>
      <div class="metric-value-line">
        <strong>${escapeHtml(metric.value)}</strong>
      </div>
      <div class="metric-progress" aria-hidden="true"><span></span></div>
      <small>${escapeHtml(metric.helper)}</small>
    </article>
  `).join("");
  }

  metricCards.forEach((metric, index) => {
    const card = container.children[index];
    if (!card) return;
    card.classList.remove("metric-good", "metric-info", "metric-warn", "metric-danger");
    card.classList.add(`metric-${metric.tone}`);
    card.style.setProperty("--metric-fill", `${clampPercent(metric.percent)}%`);
    const label = card.querySelector(".metric-topline span");
    const value = card.querySelector(".metric-value-line strong");
    const helper = card.querySelector("small");
    if (label && label.textContent !== metric.label) label.textContent = metric.label;
    if (value && value.textContent !== String(metric.value)) value.textContent = metric.value;
    if (helper && helper.textContent !== metric.helper) helper.textContent = metric.helper;
  });
  $("#sidebarOnlineCount").textContent = `${running} ${running === 1 ? "server" : "servers"} online`;
}

function renderServerSummary() {
  const summarySignature = JSON.stringify(state.servers.map((server) => ({
    id: server.id,
    name: server.name,
    status: server.status,
    message: server.message,
    command: server.command
  })));
  if (summarySignature === state.summaryRenderSignature) return;
  $("#dashboardServers").innerHTML = state.servers.length ? state.servers.map((server, index) => {
    const initials = String(server.name || "SV").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
    const message = server.message || (server.command ? "Ready to launch" : "Configure launch command");
    return `
    <div class="summary-row summary-${statusClass(server.status)}" style="--delay: ${index * 55}ms">
      <div class="row-leading">
        <span class="row-avatar">${escapeHtml(initials)}</span>
        <div>
          <strong>${escapeHtml(server.name)}</strong>
          <small>${escapeHtml(message)}</small>
        </div>
      </div>
      <span class="status-pill ${statusClass(server.status)}">${escapeHtml(statusLabel(server.status))}</span>
    </div>
  `;
  }).join("") : emptyState("No server profiles", "Add or configure server profiles in Settings to begin managing processes.", true);
  state.summaryRenderSignature = summarySignature;
}

function renderServerCard(server) {
  const disabledStart = server.command ? "" : "disabled";
  const isRunning = server.status === "running";
  const statusText = statusLabel(server.status);
  const serverInitials = String(server.name || "SV").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const commandText = server.command || "No launch command configured";
  return `
    <article class="server-card server-card-${statusClass(server.status)}" data-server-card="${escapeHtml(server.id)}">
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
        <div><span>PID</span><strong data-server-pid>${server.pid || "None"}</strong></div>
        <div><span>Uptime</span><strong data-server-uptime>${escapeHtml(server.uptime || "0s")}</strong></div>
      </div>
      <div class="detail-row server-root"><span>Root</span><span class="path-text">${escapeHtml(shortPath(server.rootPath))}</span></div>
      <div class="card-actions">
        <button class="primary-btn action-start" data-start="${server.id}" ${disabledStart}>Start</button>
        <button class="ghost-btn action-stop" data-stop="${server.id}">Stop</button>
        <button class="ghost-btn action-restart" data-restart="${server.id}" ${disabledStart}>Restart</button>
        <button class="ghost-btn action-folder" data-folder="${escapeHtml(server.rootPath)}">Open Folder</button>
        <button class="ghost-btn action-logs" data-go="logs">Logs</button>
        <button class="danger-btn action-remove" data-remove-server="${server.id}">Remove</button>
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
      : `
        <div class="server-empty">
          <div class="server-empty-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="5" rx="1.5"/><rect x="4" y="14" width="16" height="5" rx="1.5"/><path d="M8 7.5h.01"/><path d="M8 16.5h.01"/><path d="M12 7.5h4"/><path d="M12 16.5h4"/></svg></div>
          <strong>No servers configured yet</strong>
          <span>Add your first server profile, or import a JSON config from another controller.</span>
          <button class="add-server-btn" type="button" data-open-server-setup><span>+</span> Setup New Server</button>
        </div>
      `;
    state.serverRenderSignature = serverSignature;
  }
  servers.forEach((server) => {
    const card = document.querySelector(`[data-server-card="${CSS.escape(server.id)}"]`);
    if (!card) return;
    const pid = card.querySelector("[data-server-pid]");
    const uptime = card.querySelector("[data-server-uptime]");
    if (pid && pid.textContent !== String(server.pid || "None")) pid.textContent = server.pid || "None";
    if (uptime && uptime.textContent !== String(server.uptime || "0s")) uptime.textContent = server.uptime || "0s";
  });
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
  const logText = lines.length ? lines.join("\n") : "No events yet. Logs will stream here as servers, websites, updates, and GitHub tasks run.";
  if (logText !== state.logViewerSignature) {
    viewer.textContent = logText;
    viewer.scrollTop = viewer.scrollHeight;
    state.logViewerSignature = logText;
  }
  const recent = state.logs.slice(-6).reverse();
  const recentSignature = JSON.stringify(recent.map((entry) => ({
    timestamp: entry.timestamp,
    level: entry.level,
    category: entry.category,
    message: entry.message
  })));
  if (recentSignature === state.recentEventsSignature) return;
  $("#recentEvents").innerHTML = recent.length ? recent.map((entry, index) => `
    <div class="event-row event-${statusClass(entry.level)}" style="--delay: ${index * 55}ms">
      <div class="row-leading">
        <span class="event-icon">${iconSvg(entry.level === "error" || entry.level === "warning" ? "warning" : "activity")}</span>
        <div>
          <strong>${escapeHtml(entry.message)}</strong>
          <small><span>${escapeHtml(entry.category)}</span><span>${iconSvg("clock")}</span>${formatTime(entry.timestamp)}</small>
        </div>
      </div>
      <span class="status-pill ${statusClass(entry.level)}">${escapeHtml(statusLabel(entry.level))}</span>
    </div>
  `).join("") : emptyState("No recent events", "Activity from the controller will appear here as it happens.", true);
  state.recentEventsSignature = recentSignature;
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
  $("#updateInterval").value = updateSettings.checkIntervalMinutes || 60;
  $("#externalRootPath").textContent = shortPath(state.external?.rootPath);
  $("#settingsServers").innerHTML = state.servers.length ? state.servers.map((server) => `
    <div class="settings-server" data-settings-server="${server.id}">
      <input value="${escapeHtml(server.name)}" data-field="name" />
      <input value="${escapeHtml(server.rootPath || "")}" data-field="rootPath" />
      <input value="${escapeHtml(server.command || "")}" data-field="command" placeholder="Launch command" />
    </div>
  `).join("") : emptyState("No editable profiles", "Server configuration rows will appear here after profiles are available.");
}

function renderUpdateModal(updateState = {}, mode = updateState?.checking ? "checking" : updateState?.updateAvailable ? "available" : updateState?.error ? "error" : "current") {
  state.updates = { ...(state.updates || {}), ...updateState };
  const modal = $("#updateModal");
  modal.classList.remove("is-checking", "is-available", "is-current", "is-error");
  modal.classList.add(`is-${mode}`);

  const currentVersion = updateState.currentVersion || state.app?.version || state.updates?.currentVersion || "0.0.0";
  const latestVersion = updateState.latestVersion || state.updates?.latestVersion || currentVersion;
  const releaseTitle = updateState.releaseName || updateState.tagName || (mode === "current" ? "No update found" : "Latest release");
  const publishedDate = updateState.publishedAt ? `Published ${formatDateTime(updateState.publishedAt)}` : "GitHub Releases";
  const changelog = updateState.changelog?.trim() || updateState.message || (mode === "current"
    ? "You are already running the latest available version, or no public release has been published yet."
    : mode === "checking"
      ? "Hang tight while the controller checks GitHub for the newest release."
      : updateState.error || "No release notes were provided for this version.");
  const copy = {
    checking: ["Checking for Updates", "Checking GitHub Releases", "Looking for a newer ESS Server Controller build."],
    available: ["Update Detected", "New Release Found", "A newer version is ready. Update now or wait until later."],
    current: ["You're Up to Date", "No Update Found", "ESS Server Controller is already on the latest release."],
    error: ["Update Check Failed", "Could Not Check Releases", updateState.message || updateState.error || "The update service could not be reached."]
  }[mode];

  $("#updateModalTitle").textContent = copy[0];
  $("#updateModalEyebrow").textContent = copy[1];
  $("#updateModalMessage").textContent = copy[2];
  $("#modalCurrentVersion").textContent = `Current v${currentVersion}`;
  $("#modalLatestVersion").textContent = mode === "checking" ? "Checking..." : `Latest v${latestVersion || "Unknown"}`;
  $("#modalReleaseTitle").textContent = releaseTitle;
  $("#modalPublishedDate").textContent = publishedDate;
  $("#modalChangelog").textContent = changelog;
  $("#downloadUpdate").disabled = mode !== "available" || !getReleaseAssetUrl(updateState);
  $("#skipVersion").disabled = mode !== "available";
  $("#viewRelease").disabled = !updateState.releaseUrl;
  $("#remindLater").textContent = mode === "available" ? "Remind Me Later" : "Close";
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
}

function closeUpdateModal() {
  $("#updateModal").classList.remove("open");
  $("#updateModal").setAttribute("aria-hidden", "true");
}

function openServerSetupModal() {
  $("#serverSetupForm").reset();
  $("#serverSetupModal").classList.add("open");
  $("#serverSetupModal").setAttribute("aria-hidden", "false");
  setTimeout(() => $("#serverNameInput").focus(), 50);
}

function closeServerSetupModal() {
  $("#serverSetupModal").classList.remove("open");
  $("#serverSetupModal").setAttribute("aria-hidden", "true");
}

async function saveServerProfiles(servers, message = "Server config saved") {
  const nextServers = normalizeImportedServers(servers);
  const saved = await safeAction(() => window.essApi.saveSettings({ servers: nextServers }), message);
  if (!saved) return false;
  state.servers = nextServers.map((server) => ({
    ...server,
    status: "stopped",
    pid: null,
    uptime: "0s",
    message: server.command ? "Ready" : "Configure launch command"
  }));
  state.serverRenderSignature = "";
  state.websiteRenderSignature = "";
  state.summaryRenderSignature = "";
  renderServers();
  renderServerSummary();
  renderMetrics();
  renderSettings();
  return true;
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
  const minimizeButton = $("#windowMinimize");
  const maximizeButton = $("#windowMaximize");
  const closeButton = $("#windowClose");
  const titlebar = $(".custom-titlebar");
  const syncMaximizedState = async () => {
    if (!maximizeButton) return;
    const isMaximized = await window.essApi.windowIsMaximized();
    maximizeButton.classList.toggle("is-maximized", Boolean(isMaximized));
    maximizeButton.title = isMaximized ? "Restore" : "Maximize";
    maximizeButton.setAttribute("aria-label", isMaximized ? "Restore" : "Maximize");
  };
  if (minimizeButton) minimizeButton.addEventListener("click", () => window.essApi.windowMinimize());
  if (closeButton) closeButton.addEventListener("click", () => window.essApi.windowClose());
  if (maximizeButton) {
    maximizeButton.addEventListener("click", async () => {
      const isMaximized = await window.essApi.windowToggleMaximize();
      maximizeButton.classList.toggle("is-maximized", Boolean(isMaximized));
      maximizeButton.title = isMaximized ? "Restore" : "Maximize";
      maximizeButton.setAttribute("aria-label", isMaximized ? "Restore" : "Maximize");
    });
    window.addEventListener("resize", syncMaximizedState);
    syncMaximizedState();
  }
  if (titlebar) {
    titlebar.addEventListener("dblclick", async (event) => {
      if (event.target.closest("button")) return;
      await window.essApi.windowToggleMaximize();
      syncMaximizedState();
    });
  }

  $$(".nav-btn").forEach((btn) => btn.addEventListener("click", () => setPage(btn.dataset.page)));
  document.body.addEventListener("click", async (event) => {
    const target = event.target.closest("button");
    if (!target) return;
    if (target.dataset.go) setPage(target.dataset.go);
    if (target.dataset.openServerSetup !== undefined) openServerSetupModal();
    if (target.dataset.start) await safeAction(() => window.essApi.startServer(target.dataset.start));
    if (target.dataset.stop) await safeAction(() => window.essApi.stopServer(target.dataset.stop));
    if (target.dataset.restart) await safeAction(() => window.essApi.restartServer(target.dataset.restart));
    if (target.dataset.folder) await safeAction(() => window.essApi.openFolder(target.dataset.folder), "Folder opened");
    if (target.dataset.removeServer) {
      const server = state.servers.find((item) => item.id === target.dataset.removeServer);
      const confirmed = window.confirm(`Remove ${server?.name || "this server"} from the controller?`);
      if (confirmed) await saveServerProfiles(state.servers.filter((item) => item.id !== target.dataset.removeServer), "Server removed");
    }
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

  $("#openServerSetup").addEventListener("click", openServerSetupModal);
  $("#closeServerSetup").addEventListener("click", closeServerSetupModal);
  $("#cancelServerSetup").addEventListener("click", closeServerSetupModal);
  $("#serverSetupModal").addEventListener("click", (event) => {
    if (event.target.id === "serverSetupModal") closeServerSetupModal();
  });

  $("#serverSetupForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = $("#serverNameInput").value.trim();
    const server = {
      id: uniqueServerId(name),
      name,
      type: $("#serverTypeInput").value.trim(),
      rootPath: $("#serverRootInput").value.trim(),
      command: $("#serverCommandInput").value.trim(),
      args: parseArgs($("#serverArgsInput").value),
      enabled: true
    };
    const saved = await saveServerProfiles([...state.servers, server], "Server profile added");
    if (saved) closeServerSetupModal();
  });

  $("#browseServerRoot").addEventListener("click", async () => {
    const selected = await safeAction(() => window.essApi.selectServerRootFolder());
    if (selected) $("#serverRootInput").value = selected;
  });

  $("#browseServerCommand").addEventListener("click", async () => {
    const selected = await safeAction(() => window.essApi.selectServerLaunchFile());
    if (selected) {
      $("#serverCommandInput").value = selected;
      const rootInput = $("#serverRootInput");
      if (!rootInput.value.trim()) {
        const slash = Math.max(selected.lastIndexOf("\\"), selected.lastIndexOf("/"));
        if (slash > 0) rootInput.value = selected.slice(0, slash);
      }
    }
  });

  $("#exportServerConfig").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(serverConfigPayload(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ess-server-config-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("success", "Server config exported");
  });

  $("#importServerConfig").addEventListener("click", () => $("#serverConfigFile").click());
  $("#serverConfigFile").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const imported = normalizeImportedServers(JSON.parse(text));
      await saveServerProfiles(imported, "Server config imported");
    } catch (error) {
      showToast("error", "Import failed", error.message);
    }
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
        checkIntervalMinutes: Number($("#updateInterval").value || 60)
      },
      servers
    };
    await safeAction(() => window.essApi.saveSettings(settings));
    setTheme(settings.theme);
    state.notificationTimeout = settings.notificationTimeout;
  });

  async function checkForUpdates() {
    renderUpdateModal({ checking: true, currentVersion: state.app?.version || state.updates?.currentVersion }, "checking");
    const updates = await safeAction(() => window.essApi.checkForAppUpdate());
    if (!updates) {
      renderUpdateModal({ error: "Update check could not complete." }, "error");
      return;
    }
    state.updates = updates;
    renderSettings();
    renderUpdateModal(updates);
  }

  $("#checkForUpdates").addEventListener("click", checkForUpdates);
  $("#sidebarCheckUpdates").addEventListener("click", checkForUpdates);

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
    renderUpdateModal(updates, "available");
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
