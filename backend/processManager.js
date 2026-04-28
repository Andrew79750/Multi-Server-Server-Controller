const fs = require("fs");
const { spawn, execFile } = require("child_process");
const EventEmitter = require("events");

function formatUptime(startedAt) {
  if (!startedAt) return "0s";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${rest}s`;
  return `${rest}s`;
}

class ProcessManager extends EventEmitter {
  constructor(configManager, logger, shell) {
    super();
    this.configManager = configManager;
    this.logger = logger;
    this.shell = shell;
    this.processes = new Map();
    this.state = new Map();
    this.monitor = null;
  }

  init() {
    this.getProfiles().forEach((profile) => {
      this.state.set(profile.id, {
        ...profile,
        status: "stopped",
        pid: null,
        uptime: "0s",
        startedAt: null,
        message: profile.command ? "Ready" : "Configure launch command"
      });
    });
    if (!this.monitor) {
      this.monitor = setInterval(() => this.refreshRuntimeState(), 1000);
      this.monitor.unref?.();
    }
  }

  getProfiles() {
    return this.configManager.get().servers || [];
  }

  getServers() {
    this.refreshRuntimeState();
    return this.snapshot();
  }

  snapshot() {
    return this.getProfiles().map((profile) => this.state.get(profile.id) || {
      ...profile,
      status: "stopped",
      pid: null,
      uptime: "0s",
      message: profile.command ? "Ready" : "Configure launch command"
    });
  }

  getServer(id) {
    const profile = this.getProfiles().find((server) => server.id === id);
    if (!profile) throw new Error(`Unknown server: ${id}`);
    return profile;
  }

  refreshRuntimeState() {
    for (const profile of this.getProfiles()) {
      const current = this.state.get(profile.id) || {};
      const child = this.processes.get(profile.id);
      const running = Boolean(child && child.pid && !child.killed && child.exitCode === null);
      this.state.set(profile.id, {
        ...profile,
        status: running ? "running" : "stopped",
        pid: running ? child.pid : null,
        uptime: running ? formatUptime(current.startedAt) : "0s",
        startedAt: running ? current.startedAt : null,
        message: profile.command ? (running ? "Running" : "Ready") : "Configure launch command"
      });
    }
    this.emit("state", this.snapshot());
  }

  async startServer(id) {
    const profile = this.getServer(id);
    const current = this.state.get(id);
    if (current?.status === "running") return current;
    if (!profile.command) {
      const message = `${profile.name} needs a launch command before it can be started.`;
      this.logger.warning("server", message);
      throw new Error(message);
    }
    if (!fs.existsSync(profile.rootPath)) {
      const message = `Server root does not exist: ${profile.rootPath}`;
      this.logger.error("server", message);
      throw new Error(message);
    }

    const child = spawn(profile.command, profile.args || [], {
      cwd: profile.rootPath,
      windowsHide: true,
      detached: false,
      stdio: ["ignore", "pipe", "pipe"]
    });

    this.processes.set(id, child);
    this.state.set(id, {
      ...profile,
      status: "running",
      pid: child.pid,
      startedAt: new Date().toISOString(),
      uptime: "0s",
      message: "Running"
    });

    child.stdout?.on("data", (chunk) => this.logger.info("server", `${profile.name}: ${chunk.toString().trim()}`));
    child.stderr?.on("data", (chunk) => this.logger.warning("server", `${profile.name}: ${chunk.toString().trim()}`));
    child.on("exit", (code, signal) => {
      this.logger.warning("server", `${profile.name} stopped`, { code, signal });
      this.processes.delete(id);
      this.refreshRuntimeState();
    });
    child.on("error", (error) => {
      this.logger.error("server", `${profile.name} failed to start`, error.message);
      this.processes.delete(id);
      this.refreshRuntimeState();
    });

    this.logger.info("server", `${profile.name} started`, { pid: child.pid });
    this.refreshRuntimeState();
    return this.state.get(id);
  }

  async stopServer(id) {
    const profile = this.getServer(id);
    const child = this.processes.get(id);
    if (!child?.pid) {
      this.refreshRuntimeState();
      return this.state.get(id);
    }
    await new Promise((resolve) => {
      execFile("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, timeout: 15000 }, () => resolve());
    });
    this.processes.delete(id);
    this.logger.info("server", `${profile.name} stopped`);
    this.refreshRuntimeState();
    return this.state.get(id);
  }

  async restartServer(id) {
    await this.stopServer(id);
    return this.startServer(id);
  }

  async openFolder(targetPath) {
    if (!targetPath || !fs.existsSync(targetPath)) throw new Error(`Folder does not exist: ${targetPath}`);
    await this.shell.openPath(targetPath);
    return true;
  }
}

module.exports = ProcessManager;
