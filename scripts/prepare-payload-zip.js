const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const sourceDir = path.join(root, "dist-app", "win-unpacked");
const installerPayloadDir = path.join(root, "installer", "resources");
const installerPayloadPath = path.join(installerPayloadDir, "payload.zip");

if (!fs.existsSync(sourceDir)) {
  console.error(`ERROR: ${sourceDir} does not exist. Run electron-builder --dir first.`);
  process.exit(1);
}

fs.mkdirSync(installerPayloadDir, { recursive: true });
fs.rmSync(installerPayloadPath, { force: true });

const sourceGlob = path.join(sourceDir, "*");
execFileSync("powershell", [
  "-NoProfile",
  "-NonInteractive",
  "-Command",
  "& { param($sourceGlob, $zipPath) Compress-Archive -Path $sourceGlob -DestinationPath $zipPath -Force }",
  sourceGlob,
  installerPayloadPath,
], { stdio: "inherit" });

const sizeMB = (fs.statSync(installerPayloadPath).size / 1024 / 1024).toFixed(1);

console.log(`Payload ZIP bundled for custom installer: ${installerPayloadPath}`);
console.log(`Payload ZIP size: ${sizeMB} MB`);
