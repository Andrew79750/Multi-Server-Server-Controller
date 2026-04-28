/**
 * prepare-payload.js
 * Zips dist/win-unpacked into installer/resources/app.zip
 * Run: node scripts/prepare-payload.js
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = path.resolve(__dirname, '..');
// Prefer dist/win-unpacked; fall back to dist2/win-unpacked if absent
let src = path.join(root, 'dist', 'win-unpacked');
if (!fs.existsSync(src)) src = path.join(root, 'dist2', 'win-unpacked');
const dest = path.join(root, 'installer', 'resources', 'app.zip');

if (!fs.existsSync(src)) {
  console.error('ERROR: dist/win-unpacked not found. Run "npm run pack:app" first.');
  process.exit(1);
}

fs.mkdirSync(path.dirname(dest), { recursive: true });

if (fs.existsSync(dest)) {
  fs.unlinkSync(dest);
  console.log('Removed old app.zip');
}

console.log(`Zipping: ${src}`);
console.log(`     To: ${dest}`);

// Use PowerShell Compress-Archive (ships with Windows 10/11/Server 2016+)
const srcGlob = path.join(src, '*').replace(/\\/g, '\\\\');
const destPs  = dest.replace(/\\/g, '\\\\');

execSync(
  `powershell -NoProfile -NonInteractive -Command "Compress-Archive -Path '${srcGlob}' -DestinationPath '${destPs}' -Force"`,
  { stdio: 'inherit' }
);

const sizeMB = (fs.statSync(dest).size / 1024 / 1024).toFixed(1);
console.log(`\nDone — app.zip created (${sizeMB} MB)`);
