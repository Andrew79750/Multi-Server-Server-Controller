const fs = require("fs");
const path = require("path");
const defaultConfig = require("../config/defaultConfig");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mergeConfig(base, override) {
  if (!override || typeof override !== "object") return clone(base);
  const result = Array.isArray(base) ? clone(override) : { ...clone(base) };
  for (const [key, value] of Object.entries(override)) {
    if (Array.isArray(value)) {
      result[key] = clone(value);
    } else if (value && typeof value === "object" && base[key] && typeof base[key] === "object" && !Array.isArray(base[key])) {
      result[key] = mergeConfig(base[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

class ConfigManager {
  constructor(appDataPath) {
    this.configDir = path.join(appDataPath, "ESS Server Controller");
    this.configPath = path.join(this.configDir, "config.json");
    this.config = clone(defaultConfig);
  }

  init() {
    fs.mkdirSync(this.configDir, { recursive: true });
    if (fs.existsSync(this.configPath)) {
      const raw = fs.readFileSync(this.configPath, "utf8");
      this.config = mergeConfig(defaultConfig, JSON.parse(raw));
    } else {
      this.save(this.config);
    }
    return this.get();
  }

  get() {
    return clone(this.config);
  }

  save(nextConfig) {
    this.config = mergeConfig(defaultConfig, nextConfig);
    fs.mkdirSync(this.configDir, { recursive: true });
    fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), "utf8");
    return this.get();
  }

  patch(patch) {
    return this.save(mergeConfig(this.config, patch));
  }

  reset() {
    return this.save(defaultConfig);
  }
}

module.exports = ConfigManager;
