/**
 * Pre-build step for the NSIS installer target.
 * Downloads the official Wireshark Windows x64 installer into
 *   build/wireshark/Wireshark-x64.exe
 * so electron-builder can bundle it via `extraResources`.
 *
 * Auto-discovers the latest stable version from the Wireshark download page,
 * with a hard-coded fallback when the index can't be fetched.
 *
 * Skipped (no error) when:
 *   - File already present (use --force to re-download)
 *   - env WIRECHAR_SKIP_WIRESHARK_BUNDLE=1
 *
 * Override the picked version with env WIRECHAR_WIRESHARK_VERSION=4.4.15
 * Override the full URL with     env WIRECHAR_WIRESHARK_URL=https://...
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const FALLBACK_VERSION = '4.6.5';   // bump as Wireshark releases new versions
const MIRRORS = [
  'https://1.as.dl.wireshark.org/win64',
  'https://1.eu.dl.wireshark.org/win64',
  'https://1.na.dl.wireshark.org/win64',
  'https://www.wireshark.org/download/win64',
];

const OUT_DIR  = path.join(__dirname, 'wireshark');
const OUT_FILE = path.join(OUT_DIR, 'Wireshark-x64.exe');

// Always create the dir so electron-builder's extraResources doesn't error
// when this script is skipped (the filter just matches nothing in that case).
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

if (process.env.WIRECHAR_SKIP_WIRESHARK_BUNDLE === '1') {
  console.log('[wireshark-dl] WIRECHAR_SKIP_WIRESHARK_BUNDLE=1 — skipping (dir created)');
  process.exit(0);
}
const force = process.argv.includes('--force');
if (fs.existsSync(OUT_FILE) && !force) {
  const mb = (fs.statSync(OUT_FILE).size / 1024 / 1024).toFixed(1);
  console.log(`[wireshark-dl] Cached: ${OUT_FILE} (${mb} MB) — re-run with --force to refresh`);
  process.exit(0);
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function httpGet(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Too many redirects'));
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(httpGet(res.headers.location, redirects + 1));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    }).on('error', reject);
  });
}

async function discoverLatestVersion() {
  if (process.env.WIRECHAR_WIRESHARK_VERSION) {
    return process.env.WIRECHAR_WIRESHARK_VERSION;
  }
  try {
    const html = await httpGet('https://www.wireshark.org/download.html');
    const matches = [...html.matchAll(/Wireshark-(\d+\.\d+\.\d+)-x64\.exe/g)];
    if (matches.length === 0) throw new Error('No version found in download page');
    // Take highest version found
    const versions = [...new Set(matches.map(m => m[1]))]
      .sort((a, b) => {
        const ap = a.split('.').map(Number);
        const bp = b.split('.').map(Number);
        for (let i = 0; i < 3; i++) if (ap[i] !== bp[i]) return bp[i] - ap[i];
        return 0;
      });
    return versions[0];
  } catch (e) {
    console.log(`[wireshark-dl] Could not discover latest (${e.message}). Using fallback ${FALLBACK_VERSION}.`);
    return FALLBACK_VERSION;
  }
}

function downloadTo(url, dest) {
  return new Promise((resolve, reject) => {
    const tryFetch = (u, redirects) => {
      if (redirects > 5) return reject(new Error('Too many redirects'));
      https.get(u, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return tryFetch(res.headers.location, redirects + 1);
        }
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        const total = parseInt(res.headers['content-length'] || '0', 10);
        const out = fs.createWriteStream(dest);
        let downloaded = 0;
        let lastPct = -1;
        res.on('data', (chunk) => {
          downloaded += chunk.length;
          if (total > 0) {
            const pct = Math.floor(downloaded / total * 100);
            if (pct !== lastPct && pct % 5 === 0) {
              process.stdout.write(`\r[wireshark-dl] ${pct}% (${(downloaded/1024/1024).toFixed(1)}/${(total/1024/1024).toFixed(1)} MB)`);
              lastPct = pct;
            }
          }
        });
        res.pipe(out);
        out.on('finish', () => out.close(() => { process.stdout.write('\n'); resolve(); }));
        out.on('error', reject);
      }).on('error', reject);
    };
    tryFetch(url, 0);
  });
}

async function tryMirrors(version) {
  if (process.env.WIRECHAR_WIRESHARK_URL) {
    console.log(`[wireshark-dl] Using URL override: ${process.env.WIRECHAR_WIRESHARK_URL}`);
    await downloadTo(process.env.WIRECHAR_WIRESHARK_URL, OUT_FILE);
    return;
  }
  let lastErr;
  for (const m of MIRRORS) {
    const url = `${m}/Wireshark-${version}-x64.exe`;
    console.log(`[wireshark-dl] Trying ${url}`);
    try {
      await downloadTo(url, OUT_FILE);
      return;
    } catch (e) {
      console.log(`[wireshark-dl]   ${e.message}`);
      try { if (fs.existsSync(OUT_FILE)) fs.unlinkSync(OUT_FILE); } catch (_) {}
      lastErr = e;
    }
  }
  throw lastErr || new Error('All mirrors failed');
}

// ── Main ────────────────────────────────────────────────────────────────────
(async () => {
  try {
    const version = await discoverLatestVersion();
    console.log(`[wireshark-dl] Target version: ${version}`);
    await tryMirrors(version);
    const mb = (fs.statSync(OUT_FILE).size / 1024 / 1024).toFixed(1);
    console.log(`[wireshark-dl] Saved: ${OUT_FILE} (${mb} MB)`);
  } catch (err) {
    console.error(`[wireshark-dl] ERROR: ${err.message}`);
    console.error(`[wireshark-dl] Manual fallback: download Wireshark x64 from`);
    console.error(`                https://www.wireshark.org/download.html`);
    console.error(`                and save it to ${OUT_FILE}`);
    process.exit(1);
  }
})();
