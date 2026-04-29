const fs = require("fs");
const path = require("path");

function rm(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

exports.default = async function pruneElectronDist(context) {
  const appOutDir = context.appOutDir;
  const localesDir = path.join(appOutDir, "locales");

  if (fs.existsSync(localesDir)) {
    for (const file of fs.readdirSync(localesDir)) {
      if (!/^en-US\.pak$/i.test(file)) {
        rm(path.join(localesDir, file));
      }
    }
  }

  for (const file of [
    "LICENSES.chromium.html",
    "LICENSE.electron.txt",
    "chrome_200_percent.pak",
  ]) {
    rm(path.join(appOutDir, file));
  }
};
