/**
 * Pre-build step: download WinDivert SDK (DLL + signed driver + lib + headers).
 * Extracts the x64 components we need into:
 *
 *   build/windivert/
 *     WinDivert.dll       (user-mode wrapper, x64)
 *     WinDivert64.sys     (kernel driver, MS-signed)
 *     WinDivert.lib       (link library for the helper)
 *     include/
 *       windivert.h
 *       windivert_device.h
 *
 * WinDivert is dual-licensed LGPL + GPL. wirechar inherits the GPL when
 * bundling these binaries; if you distribute under another license you must
 * obtain a commercial license from the WinDivert author.
 *
 * Skip with:  WIRECHAR_SKIP_WINDIVERT=1
 * Force re-download:  --force
 * Override version:  WIRECHAR_WINDIVERT_VERSION=2.2.2
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const FALLBACK_VERSION = '2.2.2';
const OUT_DIR = path.join(__dirname, 'windivert');

// Always create dirs so electron-builder's extraResources doesn't error
// when this script is skipped (the filter then matches nothing).
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
const helperDir = path.join(__dirname, 'windivert-helper');
if (!fs.existsSync(helperDir)) fs.mkdirSync(helperDir, { recursive: true });

if (process.env.WIRECHAR_SKIP_WINDIVERT === '1') {
  console.log('[windivert-dl] WIRECHAR_SKIP_WINDIVERT=1 — skipping (dirs created)');
  process.exit(0);
}

const force = process.argv.includes('--force');
const sentinel = path.join(OUT_DIR, '.fetched');
if (fs.existsSync(sentinel) && !force) {
  console.log(`[windivert-dl] Cached: ${OUT_DIR} — use --force to refresh`);
  process.exit(0);
}

// ── HTTP helpers (same redirect logic as wireshark dl) ──────────────────────
function httpGet(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Too many redirects'));
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(httpGet(res.headers.location, redirects + 1));
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

async function discoverLatest() {
  if (process.env.WIRECHAR_WINDIVERT_VERSION) return process.env.WIRECHAR_WINDIVERT_VERSION;
  try {
    const buf = await httpGet('https://api.github.com/repos/basil00/WinDivert/releases/latest');
    // GitHub API requires user-agent — fall back to fixed if it fails
    const json = JSON.parse(buf.toString('utf8'));
    const tag = (json.tag_name || '').replace(/^v/i, '');
    if (tag) return tag;
  } catch (_) {}
  return FALLBACK_VERSION;
}

// ── 7z extraction (uses electron-builder's bundled 7za if available) ────────
function find7z() {
  // electron-builder ships 7za with node_modules
  const candidates = [
    path.join(__dirname, '..', 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe'),
    'C:\\Program Files\\7-Zip\\7z.exe',
    'C:\\Program Files (x86)\\7-Zip\\7z.exe',
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return null;
}

async function downloadZip(version) {
  // WinDivert release zip filename pattern
  const filename = `WinDivert-${version}-A.zip`;
  const url = `https://github.com/basil00/WinDivert/releases/download/v${version}/${filename}`;
  console.log(`[windivert-dl] Downloading ${url}`);
  const buf = await httpGet(url);
  const zipPath = path.join(OUT_DIR, filename);
  fs.writeFileSync(zipPath, buf);
  console.log(`[windivert-dl] Saved ${(buf.length / 1024 / 1024).toFixed(2)} MB`);
  return zipPath;
}

function extractZip(zipPath) {
  // Try 7z first (electron-builder bundles it), fall back to PowerShell Expand-Archive
  const seven = find7z();
  if (seven) {
    console.log(`[windivert-dl] Extracting with ${path.basename(seven)}…`);
    execSync(`"${seven}" x -y -o"${OUT_DIR}" "${zipPath}"`, { stdio: 'inherit' });
  } else {
    console.log(`[windivert-dl] Extracting with PowerShell Expand-Archive…`);
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${OUT_DIR}' -Force"`,
      { stdio: 'inherit' }
    );
  }
}

function flatten() {
  // The zip contains a top-level folder like WinDivert-2.2.2-A/  with x64/ and include/
  // Flatten so we end up with predictable paths
  const entries = fs.readdirSync(OUT_DIR);
  const topDir = entries
    .map(e => path.join(OUT_DIR, e))
    .find(p => fs.statSync(p).isDirectory() && /WinDivert-/i.test(path.basename(p)));
  if (!topDir) return;

  // Move what we need to predictable spots
  const wants = [
    { from: ['x64', 'WinDivert.dll'],   to: 'WinDivert.dll'   },
    { from: ['x64', 'WinDivert64.sys'], to: 'WinDivert64.sys' },
    { from: ['x64', 'WinDivert.lib'],   to: 'WinDivert.lib'   },
    { from: ['include', 'windivert.h'],         to: 'include/windivert.h'         },
    { from: ['include', 'windivert_device.h'],  to: 'include/windivert_device.h'  },
  ];
  for (const w of wants) {
    const src = path.join(topDir, ...w.from);
    const dst = path.join(OUT_DIR, w.to);
    if (!fs.existsSync(src)) {
      console.warn(`[windivert-dl] WARN: missing ${src}`);
      continue;
    }
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
  // Save the LICENSE alongside for compliance
  for (const name of ['LICENSE', 'LGPL.txt', 'GPL.txt', 'README']) {
    const src = path.join(topDir, name);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(OUT_DIR, name));
  }
}

// ── Main ────────────────────────────────────────────────────────────────────
(async () => {
  try {
    const version = await discoverLatest();
    console.log(`[windivert-dl] Target: WinDivert ${version}`);

    const zipPath = await downloadZip(version);
    extractZip(zipPath);
    flatten();
    fs.writeFileSync(sentinel, JSON.stringify({ version, fetchedAt: new Date().toISOString() }, null, 2));
    console.log(`[windivert-dl] Done. Output: ${OUT_DIR}`);
  } catch (err) {
    console.error(`[windivert-dl] ERROR: ${err.message}`);
    console.error(`[windivert-dl] Manual fallback: download WinDivert-*-A.zip from`);
    console.error(`                https://github.com/basil00/WinDivert/releases`);
    console.error(`                extract x64/* and include/* into ${OUT_DIR}`);
    process.exit(1);
  }
})();
