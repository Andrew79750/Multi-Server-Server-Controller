const fs = require("fs");
const path = require("path");
const EventEmitter = require("events");

class Logger extends EventEmitter {
  constructor(appDataPath) {
    super();
    this.logDir = path.join(appDataPath, "ESS Server Controller", "logs");
    this.logPath = path.join(this.logDir, "app.log");
    this.entries = [];
  }

  init() {
    fs.mkdirSync(this.logDir, { recursive: true });
    if (!fs.existsSync(this.logPath)) fs.writeFileSync(this.logPath, "", "utf8");
    this.entries = fs.readFileSync(this.logPath, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-500)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return {
            timestamp: new Date().toISOString(),
            level: "info",
            category: "app",
            message: line
          };
        }
      });
  }

  write(level, category, message, details = null) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      details
    };
    this.entries.push(entry);
    this.entries = this.entries.slice(-1000);
    fs.appendFile(this.logPath, `${JSON.stringify(entry)}\n`, () => {});
    this.emit("log", entry);
    return entry;
  }

  info(category, message, details) {
    return this.write("info", category, message, details);
  }

  warning(category, message, details) {
    return this.write("warning", category, message, details);
  }

  error(category, message, details) {
    return this.write("error", category, message, details);
  }

  getLogs(filter = "all") {
    if (!filter || filter === "all") return [...this.entries];
    const key = filter.toLowerCase();
    return this.entries.filter((entry) => entry.level === key || entry.category === key);
  }

  clear() {
    this.entries = [];
    fs.writeFileSync(this.logPath, "", "utf8");
    this.emit("cleared");
  }
}

module.exports = Logger;
