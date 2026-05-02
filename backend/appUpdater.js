const https = require("https");
const semver = require("semver");
const EventEmitter = require("events");

function normalizeVersion(value) {
  return String(value || "").trim().replace(/^v/i, "");
}

function pickInstallerAssets(assets = []) {
  return assets
    .filter((asset) => /\.(exe|msi)$/i.test(asset.name || ""))
    .map((asset) => ({
      name: asset.name,
      size: asset.size,
      url: asset.browser_download_url,
      contentType: asset.content_type
    }));
}

class HttpStatusError extends Error {
  constructor(statusCode, body) {
    super(`GitHub API returned ${statusCode}`);
    this.name = "HttpStatusError";
    this.statusCode = statusCode;
    this.body = body;
  }
}

class AppUpdater extends EventEmitter {
  constructor(configManager, logger, currentVersion) {
    super();
    this.configManager = configManager;
    this.logger = logger;
    this.currentVersion = normalizeVersion(currentVersion);
    this.timer = null;
    this.checking = false;
    this.lastResult = {
      checking: false,
      updateAvailable: false,
      currentVersion: this.currentVersion,
      latestVersion: null,
      releaseName: "",
      tagName: "",
      changelog: "",
      publishedAt: null,
      releaseUrl: "",
      assets: [],
      lastChecked: null,
      error: ""
    };
  }

  init() {
    this.configureTimer();
  }

  configureTimer() {
    if (this.timer) clearInterval(this.timer);
    const config = this.configManager.get().appUpdates;
    if (!config?.enabled) return;
    const minutes = Math.max(60, Number(config.checkIntervalMinutes || 60));
    this.timer = setInterval(() => this.checkLatest({ manual: false, notifyFailures: false }), minutes * 60 * 1000);
    this.timer.unref?.();
  }

  getState() {
    return {
      ...this.lastResult,
      settings: this.configManager.get().appUpdates
    };
  }

  emitState() {
    this.emit("state", this.getState());
  }

  requestJson(url) {
    return new Promise((resolve, reject) => {
      const request = https.get(url, {
        headers: {
          "User-Agent": "ESS-Server-Controller",
          "Accept": "application/vnd.github+json"
        },
        timeout: 15000
      }, (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new HttpStatusError(response.statusCode, body));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(new Error(`Could not parse GitHub response: ${error.message}`));
          }
        });
      });
      request.on("timeout", () => request.destroy(new Error("GitHub update check timed out")));
      request.on("error", reject);
    });
  }

  async checkLatest(options = {}) {
    const { manual = false } = options;
    const config = this.configManager.get().appUpdates;
    if (!config?.enabled && !manual) return this.getState();
    if (this.checking) return this.getState();

    this.checking = true;
    this.lastResult = { ...this.lastResult, checking: true, error: "" };
    this.emitState();

    const owner = config.github?.owner || "Andrew79750";
    const repo = config.github?.repo || "Multi-Server-Server-Controller";
    const url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
    const releaseUrl = `https://github.com/${owner}/${repo}/releases`;

    try {
      const release = await this.requestJson(url);
      const latestVersion = normalizeVersion(release.tag_name);
      const validCurrent = semver.valid(this.currentVersion);
      const validLatest = semver.valid(latestVersion);
      const updateAvailable = Boolean(validCurrent && validLatest && semver.gt(validLatest, validCurrent));
      const skipped = config.skippedVersion && normalizeVersion(config.skippedVersion) === latestVersion;
      const assets = pickInstallerAssets(release.assets || []);

      this.lastResult = {
        checking: false,
        updateAvailable: updateAvailable && !skipped,
        currentVersion: this.currentVersion,
        latestVersion,
        releaseName: release.name || release.tag_name || `v${latestVersion}`,
        tagName: release.tag_name || "",
        changelog: release.body || "",
        publishedAt: release.published_at || release.created_at || null,
        releaseUrl: release.html_url || `${releaseUrl}/latest`,
        assets,
        lastChecked: new Date().toISOString(),
        error: ""
      };

      this.logger.info("updates", updateAvailable ? `App update found: ${latestVersion}` : "App is up to date", {
        currentVersion: this.currentVersion,
        latestVersion,
        skipped
      });
    } catch (error) {
      if (error.statusCode === 404) {
        this.lastResult = {
          ...this.lastResult,
          checking: false,
          updateAvailable: false,
          currentVersion: this.currentVersion,
          latestVersion: this.currentVersion,
          releaseName: "No public release found",
          tagName: "",
          changelog: "",
          publishedAt: null,
          releaseUrl,
          assets: [],
          lastChecked: new Date().toISOString(),
          message: "No public GitHub release has been published for this app yet.",
          error: ""
        };
        this.logger.info("updates", "No public app release found", { owner, repo });
        return this.getState();
      }
      this.lastResult = {
        ...this.lastResult,
        checking: false,
        lastChecked: new Date().toISOString(),
        message: "",
        error: error.message
      };
      this.logger.warning("updates", "App update check failed", error.message);
    } finally {
      this.checking = false;
      this.emitState();
    }

    return this.getState();
  }

  skipVersion(version) {
    const normalized = normalizeVersion(version || this.lastResult.latestVersion);
    const config = this.configManager.get();
    config.appUpdates.skippedVersion = normalized || null;
    this.configManager.save(config);
    this.lastResult = {
      ...this.lastResult,
      updateAvailable: this.lastResult.latestVersion !== normalized && this.lastResult.updateAvailable
    };
    this.emitState();
    return this.getState();
  }
}

module.exports = AppUpdater;
