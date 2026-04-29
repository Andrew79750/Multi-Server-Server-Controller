const fs = require("fs");
const path = require("path");

const FOLDERS = ["scripts", "configs", "data", "logs"];

class ExternalFiles {
  constructor(basePath) {
    this.rootPath = basePath;
    this.paths = Object.fromEntries(FOLDERS.map((folder) => [folder, path.join(this.rootPath, folder)]));
  }

  init() {
    fs.mkdirSync(this.rootPath, { recursive: true });
    for (const folderPath of Object.values(this.paths)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    const readmePath = path.join(this.rootPath, "README.txt");
    if (!fs.existsSync(readmePath)) {
      fs.writeFileSync(
        readmePath,
        [
          "ESS Server Controller external files",
          "",
          "Files in this folder are intentionally outside the app executable.",
          "Place editable scripts in scripts, runtime config in configs, and generated data in data/logs.",
          "",
        ].join("\r\n"),
        "utf8"
      );
    }
  }

  getState() {
    return {
      rootPath: this.rootPath,
      paths: this.paths,
      scripts: this.listScripts()
    };
  }

  listScripts() {
    if (!fs.existsSync(this.paths.scripts)) return [];
    return fs.readdirSync(this.paths.scripts, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const filePath = path.join(this.paths.scripts, entry.name);
        const stat = fs.statSync(filePath);
        return {
          name: entry.name,
          path: filePath,
          size: stat.size,
          modifiedAt: stat.mtime.toISOString()
        };
      });
  }
}

module.exports = ExternalFiles;
