const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const PacketCapture = require('./src/capture');
const AttackDetector = require('./src/detector');
const firewall = require('./src/firewall');
const WinDivertFirewall = require('./src/firewall-windivert');
const settings = require('./src/settings');
const ds = require('./src/dialog-strings');
const ipHostCache = require('./src/ip-host-cache');
const ptr = require('./src/ptr-lookup');
const userWhitelist = require('./src/user-whitelist');

// Real-time IP dropper (NSIS build only). Falls back gracefully to netsh.
const windivert = new WinDivertFirewall();
let windivertActive = false;

const WIRESHARK_DOWNLOAD_URL = 'https://www.wireshark.org/download.html';

function isAdmin() {
  try {
    execSync('net session', { stdio: 'ignore' });
    return true;
  } catch (_) {
    return false;
  }
}

// ── Cache fix (must run BEFORE app.whenReady) ──
// Chromium tries to migrate the GPU shader cache between runs; when a previous
// run was elevated and the current isn't (or vice versa), the migration fails
// with ACCESS_DENIED. We don't need shader caching for our static UI, so:
//   1) Disable the GPU shader disk cache entirely
//   2) Use a separate userData directory per privilege level so files written
//      while elevated never clash with non-elevated runs (and the other way).
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-gpu-disk-cache');

const _isAdminAtStart = isAdmin();
try {
  const base = app.getPath('appData');
  const suffix = _isAdminAtStart ? '-admin' : '-user';
  app.setPath('userData', path.join(base, 'wirechar' + suffix));
} catch (_) {}

let mainWindow;
let tray = null;
let quitting = false;
const capture = new PacketCapture();
const detector = new AttackDetector();

// ── Icon resolution ──
// Located via build/icons in dev, resources/icons in packaged app
function findIconFile(name) {
  const candidates = [
    process.resourcesPath ? path.join(process.resourcesPath, 'icons', name) : null,
    path.join(__dirname, 'build', 'icons', name),
  ].filter(Boolean);
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return null;
}

/**
 * Resolve the directory where the wirechar binary lives.
 *
 *   Portable build:   PORTABLE_EXECUTABLE_DIR env (set by electron-builder)
 *   NSIS install:     dir(app.getPath('exe'))   e.g. C:\Program Files\wirechar
 *   Dev (npm start):  repo root (this main.js's dir)
 *
 * Logs live in <installDir>/logs/ regardless of build type.
 */
/**
 * Idempotent one-time migration of any `.jsonl` files from `oldLogDir` into
 * the current `newLogDir`. Safe to call repeatedly — files that already
 * exist at the target are skipped, sources that don't exist are no-ops.
 *
 * Used to relocate logs across wirechar versions:
 *   - %APPDATA%/wirechar-admin/logs   (pre-1.0.3)  → userData/logs
 *   - <installDir>/logs               (1.0.3-1.0.5) → userData/logs
 */
function migrateLegacyLogs(oldLogDir, newLogDir) {
  try {
    if (!oldLogDir || !fs.existsSync(oldLogDir) || oldLogDir === newLogDir) return;
    if (!fs.existsSync(newLogDir)) fs.mkdirSync(newLogDir, { recursive: true });
    const files = fs.readdirSync(oldLogDir).filter(f => f.endsWith('.jsonl'));
    if (files.length === 0) {
      // Nothing to move — try to clean up empty dir (ignored if not empty)
      try { fs.rmdirSync(oldLogDir); } catch (_) {}
      return;
    }
    let moved = 0;
    for (const f of files) {
      const from = path.join(oldLogDir, f);
      const to   = path.join(newLogDir, f);
      if (fs.existsSync(to)) continue;
      try { fs.renameSync(from, to); moved++; }
      catch (_) {
        // Cross-drive / cross-mount — fall back to copy+unlink
        try { fs.copyFileSync(from, to); fs.unlinkSync(from); moved++; }
        catch (_) {}
      }
    }
    try { fs.rmdirSync(oldLogDir); } catch (_) {}
    if (moved > 0) console.log(`[wirechar] migrated ${moved} log files: ${oldLogDir} → ${newLogDir}`);
  } catch (e) {
    console.warn('[wirechar] log migration failed:', e.message);
  }
}

function getInstallDir() {
  if (process.env.PORTABLE_EXECUTABLE_DIR) return process.env.PORTABLE_EXECUTABLE_DIR;
  if (app.isPackaged) return path.dirname(app.getPath('exe'));
  return __dirname;
}

// Persistent session log dir + settings — must be set after app is ready
app.whenReady().then(() => {
  const ud = app.getPath('userData');
  // Logs live under userData (e.g. %APPDATA%\wirechar-admin\logs).
  // Earlier versions tried Program Files but Windows UAC file-system
  // virtualisation silently redirected writes, leaving 0-byte files in
  // the install dir while the real data ended up under VirtualStore.
  // userData is the correct, writable home for runtime state.
  capture.logDir = path.join(ud, 'logs');
  settings.init(ud);
  ipHostCache.init(path.join(ud, 'ip-host-cache.json'));
  ptr.attach(ipHostCache);

  // Load user-managed whitelist and seed it into the detector so the
  // existing "is this IP whitelisted?" early-return picks them up too.
  userWhitelist.init(path.join(ud, 'user-whitelist.json'));
  for (const { ip } of userWhitelist.list()) detector.config.whitelist.add(ip);
  ptr.on('resolved', (e) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('iphost-learned', e);
    }
    // ALSO inform the detector — its trust list lives separately, and we
    // want PTR-resolved hosts (e.g. *.bc.googleusercontent.com) to mark
    // Discord-voice IPs as trusted before the grace period expires.
    detector.learnHost(e.ip, e.host);
  });
  console.log('[wirechar] log dir:', capture.logDir);
  // Migrate from the 1.0.3–1.0.5 install-dir layout if anything's there.
  // Function is idempotent + safe when source dir doesn't exist.
  migrateLegacyLogs(path.join(getInstallDir(), 'logs'), capture.logDir);
  // Also catch UAC-virtualised writes: when 1.0.3-1.0.5 wrote to
  // C:\Program Files\wirechar\logs Windows silently redirected to
  // %LOCALAPPDATA%\VirtualStore\Program Files\wirechar\logs
  const virtStore = path.join(app.getPath('home'), 'AppData', 'Local',
                              'VirtualStore', 'Program Files', 'wirechar', 'logs');
  migrateLegacyLogs(virtStore, capture.logDir);

  // Spin up WinDivert helper if bundled. Failures (no helper, no admin,
  // driver not registered) downgrade silently to netsh-only blocking.
  if (windivert.isAvailable()) {
    windivert.on('ready', () => {
      windivertActive = true;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('windivert-status', { active: true });
      }
    });
    windivert.on('exit',  () => {
      windivertActive = false;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('windivert-status', { active: false });
      }
    });
    windivert.on('stats', (s) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('windivert-stats', s);
      }
    });
    windivert.on('error', (err) => {
      // Surface but don't crash — netsh fallback still works
      console.error('[windivert]', err.message);
    });
    windivert.start();
  }
});

// Defense mode: 'off' | 'detect' | 'block'
let defenseMode = 'off';
// Auto-blocked IPs with scheduled unblock
const autoBlocked = new Map(); // ip → { since, type, timer }
const AUTO_UNBLOCK_MS = 60 * 60 * 1000; // 1 hour

// Whitelist local subnets so we don't block ourselves
detector.config.whitelist.add('127.0.0.1');
// Whitelist all known local IPs
for (const ip of capture.localIPs) detector.config.whitelist.add(ip);

// Process every incoming packet for attack analysis
capture.on('packet', (pkt) => {
  if (defenseMode !== 'off') detector.process(pkt);

  // Always learn IP↔host bindings — even when defense is off — so brand
  // badges keep showing up across wirechar restarts.
  const remoteIP = pkt.direction === 'in' ? pkt.src : pkt.dst;
  const host = pkt.sni || pkt.httpHost;
  if (remoteIP && host) ipHostCache.set(remoteIP, host);
  if (pkt.dnsName) {
    if (pkt.dnsA)    ipHostCache.set(pkt.dnsA,    pkt.dnsName);
    if (pkt.dnsAAAA) ipHostCache.set(pkt.dnsAAAA, pkt.dnsName);
  }

  // No host info learned for this remote yet? Schedule a background PTR lookup.
  // Catches Discord voice / WebRTC / game UDP that never expose an SNI.
  if (remoteIP && !host && !ipHostCache.get(remoteIP)) {
    ptr.request(remoteIP);
  }
});

// ── Disk-log filtering policy ────────────────────────────────────────────────
// Live view in the renderer ALWAYS gets every packet (RAM). The JSONL session
// log on disk respects this policy:
//
//   off      — never write to disk
//   attacks  — only packets to/from a flagged attacker (default)
//   smart    — skip multicast/broadcast/trusted/discovery noise; keep the rest
//   all      — write every packet (forensic / debug)
//
// When defense flags a new attacker, we ALSO retroactively dump the last
// ~500 packets matching that IP from the in-memory context buffer.
function buildLogFilter() {
  const policy = settings.get('logPolicy') || 'attacks';
  switch (policy) {
    case 'off':
      return () => false;
    case 'all':
      return () => true;
    case 'smart':
      return smartFilter;
    case 'attacks':
    default:
      return (pkt) => detector.isAttacking(pkt.src) || detector.isAttacking(pkt.dst);
  }
}

function smartFilter(pkt) {
  // Drop link-local multicast / broadcast noise
  if (!pkt.src || !pkt.dst) return false;
  if (pkt.src.startsWith('224.') || pkt.src.startsWith('239.')) return false;
  if (pkt.dst.startsWith('224.') || pkt.dst.startsWith('239.')) return false;
  if (pkt.src === '255.255.255.255' || pkt.dst === '255.255.255.255') return false;
  if (pkt.src.startsWith('169.254.') || pkt.dst.startsWith('169.254.')) return false;
  // Drop common discovery / housekeeping protocols
  const dport = pkt.tcpDstPort || pkt.udpDstPort || 0;
  const sport = pkt.tcpSrcPort || pkt.udpSrcPort || 0;
  const noise = new Set([5353 /*mDNS*/, 1900 /*SSDP*/, 137 /*NBNS*/, 138 /*NBDS*/,
                          5355 /*LLMNR*/, 67 /*DHCP*/, 68 /*DHCP*/]);
  if (noise.has(dport) || noise.has(sport)) return false;
  // Trusted big-service providers (Google, Cloudflare, Anthropic, etc.)
  if (detector.trustedIPs?.has(pkt.src) || detector.trustedIPs?.has(pkt.dst)) return false;
  return true;
}

function applyLogPolicy() {
  capture.setLogFilter(buildLogFilter());
}
applyLogPolicy();   // initial

function createWindow() {
  const iconPath = findIconFile('wirechar.ico') || findIconFile('icon-256.png');
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0a0e1a',
    icon: iconPath || undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('renderer/index.html');

  // Hide-to-tray on close: keeps capture + defense running in background.
  // Real quit comes from the tray menu (sets quitting=true first).
  mainWindow.on('close', (e) => {
    if (!quitting && tray) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  // Open DevTools with Ctrl+Shift+I
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.shift && input.key === 'I') {
      mainWindow.webContents.toggleDevTools();
    }
  });

  // Forward packet events to renderer (batched to reduce IPC overhead)
  let packetBuffer = [];
  let flushTimer = null;
  const FLUSH_INTERVAL_MS = 80;
  const MAX_BATCH_SIZE = 200;

  function flushPackets() {
    flushTimer = null;
    if (packetBuffer.length === 0) return;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('packets', packetBuffer);
    }
    packetBuffer = [];
  }

  capture.on('packet', (pkt) => {
    packetBuffer.push(pkt);
    if (packetBuffer.length >= MAX_BATCH_SIZE) {
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
      flushPackets();
    } else if (!flushTimer) {
      flushTimer = setTimeout(flushPackets, FLUSH_INTERVAL_MS);
    }
  });

  capture.on('started', () => {
    packetBuffer = [];
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  });

  capture.on('error', (err) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('capture-error', err.message);
    }
  });

  capture.on('started', (device) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('capture-started', device);
    }
  });

  // tshark died unexpectedly and is being auto-restarted
  capture.on('restarting', (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('capture-restarting', info);
    }
  });

  // ── Detector event forwarding ──
  const send = (ch, payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(ch, payload);
    }
  };

  detector.on('attack-detected', (e) => {
    send('attack-detected', e);
    // Retroactive forensic context: flush packets to/from this IP that
    // were in the circular buffer (i.e., were skipped earlier due to policy).
    try {
      const written = capture.flushBufferToLog(
        (pkt) => pkt.src === e.ip || pkt.dst === e.ip);
      if (written > 0) {
        console.log(`[log] flushed ${written} context packets for ${e.ip}`);
      }
    } catch (_) {}
  });
  detector.on('attack-ongoing', (e) => send('attack-ongoing', e));
  detector.on('attack-ended', (e) => send('attack-ended', e));
  detector.on('stats', (e) => send('attack-stats', e));

  detector.on('attack-confirmed', async (e) => {
    send('attack-confirmed', e);
    if (defenseMode === 'block' && !autoBlocked.has(e.ip)) {
      // Immediate drop via WinDivert (sub-millisecond), persistent via netsh
      if (windivertActive) windivert.block(e.ip);
      const res = await firewall.blockIP(e.ip, AUTO_UNBLOCK_MS);
      if (res.ok) {
        const timer = setTimeout(async () => {
          await firewall.unblockIP(e.ip);
          if (windivertActive) windivert.unblock(e.ip);
          autoBlocked.delete(e.ip);
          send('ip-unblocked', { ip: e.ip, reason: 'expired' });
        }, AUTO_UNBLOCK_MS);
        autoBlocked.set(e.ip, { since: Date.now(), type: e.type, timer });
        send('ip-blocked', { ip: e.ip, type: e.type, until: res.until, windivert: windivertActive });
      } else if (windivertActive) {
        // netsh failed but WinDivert is active — still effective
        const timer = setTimeout(() => {
          windivert.unblock(e.ip);
          autoBlocked.delete(e.ip);
          send('ip-unblocked', { ip: e.ip, reason: 'expired' });
        }, AUTO_UNBLOCK_MS);
        autoBlocked.set(e.ip, { since: Date.now(), type: e.type, timer });
        send('ip-blocked', { ip: e.ip, type: e.type, until: Date.now() + AUTO_UNBLOCK_MS, windivert: true });
      } else {
        send('block-error', { ip: e.ip, error: res.error });
      }
    }
  });
}

// IPC handlers
ipcMain.handle('get-devices', async () => {
  const devices = await capture.getDevices();
  const localIPs = Array.from(capture.localIPs);
  return { devices, localIPs, available: capture.isAvailable(), isAdmin: isAdmin() };
});

ipcMain.handle('start-capture', (_, deviceName, filter) => {
  const ok = capture.start(deviceName, filter);
  return ok;
});

ipcMain.handle('stop-capture', () => {
  capture.stop();
  return true;
});

// Apply new filter — only restart if currently capturing
ipcMain.handle('apply-filter', (_, filter) => {
  if (!capture.proc) {
    // Not capturing — just remember filter for next start
    capture.lastFilter = filter || '';
    return { ok: true, started: false };
  }
  capture.stop();
  const ok = capture.start(capture.lastDevice, filter);
  return { ok, started: ok };
});

// Fetch hex dump for a specific frame
ipcMain.handle('get-hex-dump', async (_, frameNumber) => {
  return capture.getHexDump(frameNumber);
});

// Session log info (path / bytes / packets / active)
ipcMain.handle('log-info', () => capture.getSessionLogInfo());

// List all log files on disk
ipcMain.handle('log-list', () => capture.listSessionLogs());

// Search / read recent N packets from a log file (default = current session)
ipcMain.handle('log-search', async (_, opts) => capture.readSessionLog(opts || {}));

// Total disk usage of saved logs
ipcMain.handle('log-disk-usage', () => capture.getLogDiskUsage());

// Current logs directory (= <install_dir>/logs)
ipcMain.handle('log-dir', () => capture.logDir);

// Persistent IP→host cache (so brand badges survive restarts)
ipcMain.handle('iphost-all',   () => ipHostCache.all());
ipcMain.handle('iphost-batch', (_, pairs) => ipHostCache.setBatch(pairs));
ipcMain.handle('iphost-clear', () => { ipHostCache.clear(); return true; });
ipcMain.handle('iphost-size',  () => ipHostCache.size());
ipcMain.handle('iphost-unset', (_, ip) => ipHostCache.unset(ip));

// Open the logs directory in OS file manager
ipcMain.handle('log-open-dir', async () => {
  if (!capture.logDir) return false;
  if (!fs.existsSync(capture.logDir)) {
    fs.mkdirSync(capture.logDir, { recursive: true });
  }
  await shell.openPath(capture.logDir);
  return true;
});

// Native-dialog confirmation + delete. Returns
//   { confirmed:false, reason } if cancelled or nothing to delete
//   { confirmed:true,  deleted, bytes, kept }
ipcMain.handle('log-clear-with-confirm', async () => {
  const usage = capture.getLogDiskUsage();
  const lang = settings.get('lang') || 'en';
  if (usage.files === 0) {
    return { confirmed: false, reason: 'empty', message: ds.t('logs_clear_empty', lang) };
  }
  const sizeMB = (usage.bytes / 1024 / 1024).toFixed(1);
  const detail = `${ds.t('logs_clear_detail', lang)}\n\n` +
                 `${usage.files} files · ${sizeMB} MB`;
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title:   ds.t('logs_clear_title',   lang),
    message: ds.t('logs_clear_message', lang),
    detail,
    buttons: [ ds.t('logs_clear_confirm', lang), ds.t('logs_clear_cancel', lang) ],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  });
  if (result.response !== 0) return { confirmed: false, reason: 'cancelled' };
  const r = capture.clearSessionLogs({ includeCurrent: false });
  return { confirmed: true, ...r };
});

// Force-clear without UI confirmation (e.g. invoked from a custom in-app modal)
ipcMain.handle('log-clear-force', (_, { includeCurrent = false } = {}) => {
  return capture.clearSessionLogs({ includeCurrent: !!includeCurrent });
});

// Defense mode control
ipcMain.handle('set-defense-mode', (_, mode) => {
  if (!['off', 'detect', 'block'].includes(mode)) return { ok: false };
  defenseMode = mode;
  return { ok: true, mode };
});

ipcMain.handle('get-defense-state', () => ({
  mode: defenseMode,
  attackingIPs: detector.getStats(),
  blockedIPs: Array.from(autoBlocked.entries()).map(([ip, info]) => ({
    ip, since: info.since, type: info.type,
  })),
}));

// ── User whitelist (per-install, persists across restarts) ──
ipcMain.handle('user-whitelist-add', (_, ip, host) => {
  if (!ip || typeof ip !== 'string') return { ok: false };
  userWhitelist.add(ip, host);
  detector.whitelist(ip);
  // If this IP was actively blocked, unblock it (whitelisted IPs shouldn't be firewalled)
  const info = autoBlocked.get(ip);
  if (info?.timer) clearTimeout(info.timer);
  autoBlocked.delete(ip);
  if (windivertActive) windivert.unblock(ip);
  firewall.unblockIP(ip).catch(() => {});
  return { ok: true };
});

ipcMain.handle('user-whitelist-remove', (_, ip) => {
  if (!ip) return { ok: false };
  const removed = userWhitelist.remove(ip);
  detector.unwhitelist(ip);
  return { ok: removed };
});

ipcMain.handle('user-whitelist-list',  () => userWhitelist.list());
ipcMain.handle('user-whitelist-has',   (_, ip) => userWhitelist.has(ip));
ipcMain.handle('user-whitelist-clear', () => {
  for (const { ip } of userWhitelist.list()) detector.unwhitelist(ip);
  userWhitelist.clear();
  return true;
});

// Manual block / unblock (dual-backend)
ipcMain.handle('block-ip', async (_, ip) => {
  if (windivertActive) windivert.block(ip);
  const res = await firewall.blockIP(ip, AUTO_UNBLOCK_MS);
  if (res.ok || windivertActive) {
    autoBlocked.set(ip, { since: Date.now(), type: 'manual', timer: null });
    return { ok: true, windivert: windivertActive, netsh: res.ok };
  }
  return res;
});

ipcMain.handle('unblock-ip', async (_, ip) => {
  const info = autoBlocked.get(ip);
  if (info?.timer) clearTimeout(info.timer);
  autoBlocked.delete(ip);
  if (windivertActive) windivert.unblock(ip);
  return firewall.unblockIP(ip);
});

ipcMain.handle('unblock-all', async () => {
  for (const [, info] of autoBlocked) if (info.timer) clearTimeout(info.timer);
  autoBlocked.clear();
  if (windivertActive) windivert.clear();
  const n = await firewall.unblockAll();
  return { count: n };
});

// Renderer can read the current WinDivert status for UI hints
ipcMain.handle('windivert-info', () => ({
  available: windivert.isAvailable(),
  active:    windivertActive,
  stats:     windivert.stats,
  blocked:   windivert.list(),
}));

// App version + detector diagnostics — for verifying you're on the latest
// build and seeing live detector state in the Stats tab.
ipcMain.handle('app-version', () => app.getVersion());
ipcMain.handle('detector-stats', () => ({
  trustedIPs:   detector.trustedIPs.size,
  byIP:         detector.byIP.size,
  suspicious:   Array.from(detector.suspicious.entries()).map(([ip, s]) => ({
    ip,
    type: s.type,
    announced: !!s.announced,
    confirmed: !!s.confirmed,
    sinceMs: Date.now() - s.since,
  })),
  userWhitelist: userWhitelist.size(),
  ipHostCache:   ipHostCache.size(),
}));

// ── Generic settings get/set (for defenseMode, logPolicy etc.) ──
ipcMain.handle('get-setting', (_, key) => settings.get(key, null));
ipcMain.handle('set-setting', (_, key, value) => {
  const allowed = new Set(['defenseMode', 'logPolicy', 'theme', 'fontFamily', 'fontSize']);
  if (!allowed.has(key)) return false;
  settings.set(key, value);
  // Hot-apply settings that affect behavior
  if (key === 'logPolicy') applyLogPolicy();
  return true;
});

// ── Language settings (file-based, shared with renderer) ──
ipcMain.handle('get-lang', () => settings.get('lang') || null);
ipcMain.handle('set-lang', (_, lang) => {
  if (lang === 'en' || lang === 'ko') {
    settings.set('lang', lang);
    if (tray?.refresh) tray.refresh();     // rebuild tray menu in the new language
    return true;
  }
  return false;
});
// Renderer hint: if main has no lang yet but renderer's localStorage already
// has one (e.g. user upgrading from older version), adopt it and skip the
// picker on next launch.
ipcMain.handle('hint-lang', (_, lang) => {
  if (!settings.get('lang') && (lang === 'en' || lang === 'ko')) {
    settings.set('lang', lang);
    onboardingDone = true;
    if (tray?.refresh) tray.refresh();
    if (capture.isAvailable === undefined || !capture.isAvailable()) {
      checkWireshark(lang).catch(() => {});
    }
    return true;
  }
  return false;
});

ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window-close', () => mainWindow?.close());

app.whenReady().then(() => {
  createWindow();
  createTray();
  setTimeout(runFirstLaunchFlow, 1500);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// ── System tray ─────────────────────────────────────────────────────────────
function createTray() {
  const tray16 = findIconFile('tray-16.png');
  const tray32 = findIconFile('tray-32.png');
  if (!tray16) {
    console.warn('[tray] tray-16.png not found — tray disabled. Run `node build/generate-icon.js`.');
    return;
  }

  // Multi-resolution image: 1× for normal DPI, 2× for HiDPI displays
  const img = nativeImage.createFromPath(tray16);
  if (tray32) {
    try {
      const big = nativeImage.createFromPath(tray32);
      if (!big.isEmpty()) {
        img.addRepresentation({
          width: 32, height: 32, scaleFactor: 2.0, buffer: big.toBitmap(),
        });
      }
    } catch (_) {}
  }

  tray = new Tray(img);
  const lang = () => settings.get('lang') || 'en';
  tray.setToolTip(ds.t('tray_tooltip', lang()));

  function buildMenu() {
    const L = lang();
    const mode = settings.get('defenseMode') || 'off';
    const logPol = settings.get('logPolicy') || 'attacks';
    const visible = mainWindow && mainWindow.isVisible();
    return Menu.buildFromTemplate([
      {
        label: visible ? ds.t('tray_hide', L) : ds.t('tray_show', L),
        click: () => toggleWindow(),
      },
      { type: 'separator' },
      {
        label: ds.t('tray_defense', L),
        submenu: [
          { label: ds.t('tray_defense_off',    L), type: 'radio', checked: mode === 'off',    click: () => setDefenseFromTray('off') },
          { label: ds.t('tray_defense_detect', L), type: 'radio', checked: mode === 'detect', click: () => setDefenseFromTray('detect') },
          { label: ds.t('tray_defense_block',  L), type: 'radio', checked: mode === 'block',  click: () => setDefenseFromTray('block') },
        ],
      },
      {
        label: ds.t('tray_logging', L),
        submenu: [
          { label: ds.t('tray_log_off',     L), type: 'radio', checked: logPol === 'off',     click: () => setLogPolicyFromTray('off') },
          { label: ds.t('tray_log_attacks', L), type: 'radio', checked: logPol === 'attacks', click: () => setLogPolicyFromTray('attacks') },
          { label: ds.t('tray_log_smart',   L), type: 'radio', checked: logPol === 'smart',   click: () => setLogPolicyFromTray('smart') },
          { label: ds.t('tray_log_all',     L), type: 'radio', checked: logPol === 'all',     click: () => setLogPolicyFromTray('all') },
        ],
      },
      { type: 'separator' },
      {
        label: ds.t('tray_open_logs', L),
        click: () => {
          if (capture.logDir) {
            try {
              if (!fs.existsSync(capture.logDir)) fs.mkdirSync(capture.logDir, { recursive: true });
              shell.openPath(capture.logDir);
            } catch (_) {}
          }
        },
      },
      { type: 'separator' },
      { label: ds.t('tray_quit', L), click: () => { quitting = true; app.quit(); } },
    ]);
  }

  function refreshMenu() {
    if (!tray || tray.isDestroyed()) return;
    tray.setToolTip(ds.t('tray_tooltip', lang()));
    tray.setContextMenu(buildMenu());
  }
  tray.refresh = refreshMenu;
  refreshMenu();

  tray.on('click',        () => toggleWindow());
  tray.on('double-click', () => showWindow());
  // Update Show/Hide label when visibility changes
  if (mainWindow) {
    mainWindow.on('show', refreshMenu);
    mainWindow.on('hide', refreshMenu);
  }
}

function showWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}
function toggleWindow() {
  if (!mainWindow) return;
  if (mainWindow.isVisible() && !mainWindow.isMinimized()) mainWindow.hide();
  else showWindow();
}

function setDefenseFromTray(mode) {
  settings.set('defenseMode', mode);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('defense-mode-changed', mode);
  }
  if (tray?.refresh) tray.refresh();
}

function setLogPolicyFromTray(policy) {
  settings.set('logPolicy', policy);
  applyLogPolicy();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('log-policy-changed', policy);
  }
  if (tray?.refresh) tray.refresh();
}

let onboardingDone = false;

async function runFirstLaunchFlow() {
  if (onboardingDone) return;
  onboardingDone = true;

  // 1) Language picker — only on the very first run (or upgrade with no setting)
  let lang = settings.get('lang');
  if (!lang) {
    lang = await pickLanguage();
    settings.set('lang', lang);
    settings.set('firstRunAt', Date.now());
    // Push to renderer so its UI matches immediately
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('lang-changed', lang);
    }
    // Refresh the tray menu — it was built with default 'en' before the picker
    if (tray?.refresh) tray.refresh();
  }

  // 2) Wireshark availability check (uses chosen language)
  await checkWireshark(lang);
}

async function pickLanguage() {
  // Bias default by system locale (Windows usually returns 'ko-KR' or 'en-US')
  const sysLocale = (app.getLocale() || '').toLowerCase();
  const defaultIdx = sysLocale.startsWith('ko') ? 1 : 0;

  const result = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    title: ds.t('lang_picker_title', 'en'),
    message: ds.t('lang_picker_message', 'en'),
    detail: ds.t('lang_picker_detail', 'en'),
    buttons: [ds.t('lang_btn_english', 'en'), ds.t('lang_btn_korean', 'en')],
    defaultId: defaultIdx,
    cancelId: defaultIdx,
    noLink: true,
  });
  return result.response === 1 ? 'ko' : 'en';
}

async function checkWireshark(lang) {
  if (capture.isAvailable()) return;
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title:   ds.t('ws_title',   lang),
    message: ds.t('ws_message', lang),
    detail:  ds.t('ws_detail',  lang),
    buttons: [
      ds.t('ws_btn_download', lang),
      ds.t('ws_btn_continue', lang),
      ds.t('ws_btn_quit',     lang),
    ],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });
  if (result.response === 0) {
    shell.openExternal(WIRESHARK_DOWNLOAD_URL);
  } else if (result.response === 2) {
    app.quit();
  }
}

app.on('window-all-closed', async () => {
  // With the tray active we keep the app alive in the background. Quitting
  // happens via the tray menu (which sets quitting=true). Without a tray
  // (e.g. icon files missing) we fall back to the traditional behavior.
  if (tray && !quitting) return;

  capture.stop();
  detector.destroy();
  ipHostCache.destroy();        // final save
  if (windivertActive) {
    try { windivert.stop(); } catch (_) {}
  }
  for (const [, info] of autoBlocked) if (info.timer) clearTimeout(info.timer);
  try { await firewall.unblockAll(); } catch (_) {}
  if (process.platform !== 'darwin') app.quit();
});

// On real quit, clean up the tray
app.on('before-quit', () => {
  quitting = true;
  if (tray && !tray.isDestroyed()) { tray.destroy(); tray = null; }
});
