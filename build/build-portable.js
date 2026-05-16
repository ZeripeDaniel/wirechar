/**
 * Portable build wrapper.
 *
 * electron-builder's extraResources cannot be overridden cleanly per-target,
 * so we stash the heavy NSIS-only files (Wireshark installer, WinDivert SDK,
 * helper.exe) out of build/ for the duration of the portable build, then
 * restore them. This keeps the portable .exe slim (~70 MB) while still
 * sharing one `extraResources` config in package.json for both targets.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const STASH = path.join(__dirname, '_portable-stash');

// Files (relative to repo root) to stash during portable build
const FILES = [
  'build/wireshark/Wireshark-x64.exe',
  'build/windivert/WinDivert.dll',
  'build/windivert/WinDivert64.sys',
  'build/windivert/LICENSE',
  'build/windivert-helper/wirechar-divert.exe',
];

function stash(rel) {
  const src = path.join(ROOT, rel);
  if (!fs.existsSync(src)) return false;
  const dst = path.join(STASH, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.renameSync(src, dst);
  return true;
}

function restore(rel) {
  const src = path.join(STASH, rel);
  if (!fs.existsSync(src)) return;
  const dst = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.renameSync(src, dst);
}

console.log('[build-portable] Stashing NSIS-only files…');
fs.mkdirSync(STASH, { recursive: true });
const stashedCount = FILES.filter(stash).length;
console.log(`[build-portable] Stashed ${stashedCount} files`);

let exitCode = 0;
try {
  // Clear win-unpacked so previous NSIS resources don't leak in
  const unpacked = path.join(ROOT, 'dist', 'win-unpacked');
  if (fs.existsSync(unpacked)) {
    fs.rmSync(unpacked, { recursive: true, force: true });
  }
  console.log('[build-portable] Running electron-builder --win portable…');
  execSync('node_modules\\.bin\\electron-builder --win portable', {
    stdio: 'inherit',
    cwd: ROOT,
    env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' },
  });
  console.log('[build-portable] OK');
} catch (err) {
  console.error('[build-portable] FAIL');
  exitCode = err.status || 1;
} finally {
  console.log('[build-portable] Restoring stashed files…');
  FILES.forEach(restore);
  try { fs.rmSync(STASH, { recursive: true, force: true }); } catch (_) {}
  process.exit(exitCode);
}
