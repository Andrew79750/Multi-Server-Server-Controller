const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const pkg = require(path.join(root, "package.json"));
const sourceDir = path.join(root, "dist-app", "win-unpacked");
const releaseDir = path.join(root, "dist-release");
const installerPayloadPath = path.join(releaseDir, `ESS-Server-Controller-Payload-${pkg.version}.zip`);
const sevenZipPath = path.join(root, "node_modules", "7zip-bin", "win", "x64", "7za.exe");

if (!fs.existsSync(sourceDir)) {
  console.error(`ERROR: ${sourceDir} does not exist. Run electron-builder --dir first.`);
  process.exit(1);
}

const localesDir = path.join(sourceDir, "locales");
if (fs.existsSync(localesDir)) {
  for (const file of fs.readdirSync(localesDir)) {
    if (!/^en-US\.pak$/i.test(file)) {
      fs.rmSync(path.join(localesDir, file), { force: true });
    }
  }
}

fs.mkdirSync(releaseDir, { recursive: true });
fs.rmSync(installerPayloadPath, { force: true });

const sourceGlob = path.join(sourceDir, "*");
if (fs.existsSync(sevenZipPath)) {
  execFileSync(sevenZipPath, [
    "a",
    "-tzip",
    "-mm=Deflate",
    "-mx=9",
    "-mfb=258",
    "-mpass=5",
    installerPayloadPath,
    sourceGlob,
  ], { stdio: "inherit" });
} else {
  execFileSync("powershell", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    "& { param($sourceGlob, $zipPath) Compress-Archive -Path $sourceGlob -DestinationPath $zipPath -Force }",
    sourceGlob,
    installerPayloadPath,
  ], { stdio: "inherit" });
}

const sizeMB = (fs.statSync(installerPayloadPath).size / 1024 / 1024).toFixed(1);

console.log(`Payload ZIP ready for GitHub Releases: ${installerPayloadPath}`);
console.log(`Payload ZIP size: ${sizeMB} MB`);
