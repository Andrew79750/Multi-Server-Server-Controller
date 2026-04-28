const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const EventEmitter = require("events");

function nowIso() {
  return new Date().toISOString();
}

function makeId(repoPath) {
  return repoPath.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

class GitHubUpdater extends EventEmitter {
  constructor(configManager, logger) {
    super();
    this.configManager = configManager;
    this.logger = logger;
    this.loop = null;
    this.scanRunning = false;
    this.repoLocks = new Set();
    this.repoState = new Map();
    this.started = false;
  }

  init() {
    this.hydrateRepos();
    if (!this.started) {
      this.started = true;
      this.loop = setInterval(() => this.tick(), 1000);
      this.loop.unref?.();
      this.logger.info("github", "GitHub updater loop started");
    }
  }

  hydrateRepos() {
    const config = this.configManager.get();
    const repos = config.github?.repos || [];
    repos.forEach((repo) => {
      if (!this.repoState.has(repo.id)) {
        this.repoState.set(repo.id, {
          ...repo,
          status: "idle",
          branch: "unknown",
          localCommit: "",
          remoteCommit: "",
          aheadBehind: "",
          updateAvailable: false,
          lastChecked: null,
          lastFetched: null,
          lastPulled: null,
          error: ""
        });
      } else {
        this.repoState.set(repo.id, { ...this.repoState.get(repo.id), ...repo });
      }
    });
  }

  getConfig() {
    return this.configManager.get().github;
  }

  getState() {
    this.hydrateRepos();
    return {
      enabled: Boolean(this.getConfig()?.enabled),
      fetchCooldownSeconds: this.getConfig()?.fetchCooldownSeconds || 30,
      pullOnUpdate: Boolean(this.getConfig()?.pullOnUpdate),
      scanRunning: this.scanRunning,
      repos: Array.from(this.repoState.values())
    };
  }

  emitState() {
    this.emit("state", this.getState());
  }

  async tick() {
    this.emitState();
    const github = this.getConfig();
    if (!github?.enabled || this.scanRunning) return;
    await this.scanDueRepos(false);
  }

  async scanDueRepos(force = false) {
    if (this.scanRunning) return this.getState();
    this.scanRunning = true;
    try {
      this.hydrateRepos();
      const cooldownMs = Math.max(5, this.getConfig()?.fetchCooldownSeconds || 30) * 1000;
      const repos = Array.from(this.repoState.values());
      for (const repo of repos) {
        const last = repo.lastFetched ? new Date(repo.lastFetched).getTime() : 0;
        const due = force || Date.now() - last >= cooldownMs;
        if (repo.enabled && due) await this.checkRepo(repo.id, force);
      }
    } finally {
      this.scanRunning = false;
      this.emitState();
    }
    return this.getState();
  }

  runGit(repoPath, args, timeout = 30000) {
    return new Promise((resolve) => {
      execFile("git", ["-C", repoPath, ...args], {
        windowsHide: true,
        timeout
      }, (error, stdout, stderr) => {
        resolve({
          ok: !error,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          error: error ? error.message : ""
        });
      });
    });
  }

  async checkRepo(id, manual = false) {
    const repo = this.repoState.get(id);
    if (!repo || this.repoLocks.has(id)) return repo;
    this.repoLocks.add(id);
    this.repoState.set(id, { ...repo, status: "checking", error: "" });
    this.emitState();

    try {
      if (!fs.existsSync(repo.path)) throw new Error(`Repo folder missing: ${repo.path}`);
      if (!fs.existsSync(path.join(repo.path, ".git"))) throw new Error(`Not a Git repository: ${repo.path}`);

      const branch = await this.runGit(repo.path, ["branch", "--show-current"], 10000);
      if (!branch.ok) throw new Error(branch.stderr || branch.error);
      const local = await this.runGit(repo.path, ["rev-parse", "HEAD"], 10000);
      if (!local.ok) throw new Error(local.stderr || local.error);
      const upstream = await this.runGit(repo.path, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], 10000);
      if (!upstream.ok) throw new Error("No upstream configured");

      const fetch = await this.runGit(repo.path, ["fetch", "--quiet", "--prune"], 30000);
      if (!fetch.ok) throw new Error(fetch.stderr || fetch.error);

      const remote = await this.runGit(repo.path, ["rev-parse", "@{u}"], 10000);
      if (!remote.ok) throw new Error(remote.stderr || remote.error);
      const aheadBehind = await this.runGit(repo.path, ["rev-list", "--left-right", "--count", "HEAD...@{u}"], 10000);
      const updateAvailable = local.stdout !== remote.stdout;

      let next = {
        ...this.repoState.get(id),
        status: updateAvailable ? "update-available" : "up-to-date",
        branch: branch.stdout || "unknown",
        localCommit: local.stdout.slice(0, 12),
        remoteCommit: remote.stdout.slice(0, 12),
        aheadBehind: aheadBehind.ok ? aheadBehind.stdout : "",
        updateAvailable,
        lastChecked: nowIso(),
        lastFetched: nowIso(),
        error: ""
      };

      this.repoState.set(id, next);
      this.logger.info("github", `${repo.name} checked`, { updateAvailable, manual });

      if (updateAvailable && this.getConfig()?.pullOnUpdate) {
        next = await this.pullRepo(id, true);
      }
      return next;
    } catch (error) {
      const next = {
        ...this.repoState.get(id),
        status: "error",
        lastChecked: nowIso(),
        error: error.message
      };
      this.repoState.set(id, next);
      this.logger.error("github", `${repo.name} check failed`, error.message);
      return next;
    } finally {
      this.repoLocks.delete(id);
      this.emitState();
    }
  }

  async pullRepo(id, fromAuto = false) {
    const repo = this.repoState.get(id);
    if (!repo) throw new Error(`Unknown repo: ${id}`);
    if (this.repoLocks.has(`${id}:pull`)) return repo;
    this.repoLocks.add(`${id}:pull`);
    this.repoState.set(id, { ...repo, status: "pulling", error: "" });
    this.emitState();
    try {
      const pull = await this.runGit(repo.path, ["pull", "--ff-only"], 60000);
      if (!pull.ok) throw new Error(pull.stderr || pull.error);
      const local = await this.runGit(repo.path, ["rev-parse", "HEAD"], 10000);
      const next = {
        ...this.repoState.get(id),
        status: "up-to-date",
        localCommit: local.ok ? local.stdout.slice(0, 12) : repo.localCommit,
        remoteCommit: local.ok ? local.stdout.slice(0, 12) : repo.remoteCommit,
        updateAvailable: false,
        lastPulled: nowIso(),
        error: ""
      };
      this.repoState.set(id, next);
      this.logger.info("github", `${repo.name} pulled`, { fromAuto, output: pull.stdout });
      return next;
    } catch (error) {
      const next = { ...this.repoState.get(id), status: "error", error: error.message };
      this.repoState.set(id, next);
      this.logger.error("github", `${repo.name} pull failed`, error.message);
      throw error;
    } finally {
      this.repoLocks.delete(`${id}:pull`);
      this.emitState();
    }
  }

  setEnabled(id, enabled) {
    const config = this.configManager.get();
    config.github.repos = config.github.repos.map((repo) => repo.id === id ? { ...repo, enabled } : repo);
    this.configManager.save(config);
    this.hydrateRepos();
    this.emitState();
    return this.getState();
  }

  addRepo(repoPath) {
    const config = this.configManager.get();
    const id = makeId(repoPath);
    if (!config.github.repos.some((repo) => repo.id === id)) {
      config.github.repos.push({ id, name: path.basename(repoPath), path: repoPath, enabled: true });
      this.configManager.save(config);
    }
    this.hydrateRepos();
    this.emitState();
    return this.getState();
  }

  removeRepo(id) {
    const config = this.configManager.get();
    config.github.repos = config.github.repos.filter((repo) => repo.id !== id);
    this.configManager.save(config);
    this.repoState.delete(id);
    this.emitState();
    return this.getState();
  }
}

module.exports = GitHubUpdater;
