import { Character } from './character.js';
import { ParticleSystem } from './particles.js';
import { renderDetailPanel } from './detail.js';
import { classifyPacket, analyzeBytes } from './classify.js';
import { t, getLang, setLang, onLangChange, applyStaticTranslations } from './i18n.js';
import { lookupVendor, iconForVendor, isMulticast } from './oui.js';
import { compileQuery } from './search.js';
import { getAllBrands, brandCanonicalHost, findBrand } from './brand-styles.js';

const api = window.wirechar;

// ── Canvas setup ────────────────────────────────────────────────────────────
const canvas = document.getElementById('mainCanvas');
const ctx = canvas.getContext('2d');

function resize() {
  const container = document.getElementById('canvasContainer');
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;
}
window.addEventListener('resize', resize);

// ── State ────────────────────────────────────────────────────────────────────
let character;
let particles;
let lastTime = 0;
let packets = [];                  // newest first, capped at MAX_PACKETS
const MAX_PACKETS = 10000;         // in-memory cap (search-friendly, ~10MB)
const MAX_RENDER_ROWS = 200;       // DOM cap (more = laggier; this is the sweet spot)
let stats = { inBytes: 0, outBytes: 0, inCount: 0, outCount: 0, startTime: Date.now() };
let capturing = false;
let selectedDevice = null;
let selectedPacketIdx = null;   // index in `packets` for detail panel
let pktAutoId = 1;              // local sequence id per packet (for stable references)

// Live-traffic search (in-memory substring; tshark -Y is the capture-level filter)
let listSearchQuery = '';

function updateListCounter(shown, totalIfFiltered) {
  const el = document.getElementById('listCounter');
  if (!el) return;
  if (totalIfFiltered != null) {
    el.textContent = `${shown} / ${totalIfFiltered}`;
  } else {
    el.textContent = `${shown} / ${packets.length}`;
  }
}

function updateLogSize() {
  const el = document.getElementById('logSize');
  if (!el || !api.logInfo) return;
  api.logInfo().then(info => {
    if (!info || !info.bytes) { el.textContent = ''; return; }
    const kb = info.bytes / 1024;
    const text = kb < 1024 ? `${kb.toFixed(0)} KB` : `${(kb/1024).toFixed(1)} MB`;
    el.textContent = `· ${info.packets.toLocaleString()} pkt · ${text}`;
    el.title = info.path || '';
  });
}

// ── IP → host cache ─────────────────────────────────────────────────────────
// TLS Client Hello carries SNI but subsequent packets to the same IP don't.
// We learn the host association once and apply it to all later packets to/from
// that IP, so brand badges (Discord, Naver, etc.) keep showing up for the whole
// session — including UDP voice / WebRTC media where SNI is never present.
//
// Persistence: the main process owns a JSON-backed copy. On startup we
// bootstrap our in-memory map from that file, so brand badges survive
// restarts. Main also learns live from every packet, so this map is just a
// renderer-side cache — we don't need to push back to main.
const ipToHostCache = new Map();
const IP_CACHE_MAX = 12000;

function cacheHost(ip, host) {
  if (!ip || !host || ip === '?' || ip === '0.0.0.0') return;
  if (host.endsWith('.')) host = host.slice(0, -1);
  if (ipToHostCache.get(ip) === host) return;
  if (ipToHostCache.has(ip)) ipToHostCache.delete(ip);   // LRU touch
  ipToHostCache.set(ip, host);
  if (ipToHostCache.size > IP_CACHE_MAX) {
    const first = ipToHostCache.keys().next().value;
    ipToHostCache.delete(first);
  }
}

// Bootstrap from main-process persisted cache as soon as the bridge is ready
(async () => {
  try {
    if (!window.wirechar?.iphostAll) return;
    const entries = await window.wirechar.iphostAll();
    if (!Array.isArray(entries)) return;
    for (const [ip, host] of entries) {
      if (ipToHostCache.size >= IP_CACHE_MAX) break;
      ipToHostCache.set(ip, host);
    }
    if (entries.length > 0) {
      console.log(`[ip-host-cache] bootstrapped ${entries.length} entries from disk`);
    }
  } catch (e) {
    console.warn('[ip-host-cache] bootstrap failed:', e.message);
  }
})();

// Live PTR-resolved entries from main process — apply immediately so the
// next packet to that IP renders with the right brand badge
if (window.wirechar?.onIphostLearned) {
  window.wirechar.onIphostLearned(({ ip, host }) => {
    cacheHost(ip, host);
  });
}

// throttling
let listDirty = false;
let lastListRender = 0;
const LIST_RENDER_INTERVAL = 100;   // 10 fps max for list rendering
let lastStatsRender = 0;
const STATS_RENDER_INTERVAL = 200;  // 5 fps for stats

// particle rate limiting
const MAX_PARTICLES = 60;
const MAX_SPAWN_PER_BATCH = 12;

// ── Tab state ─────────────────────────────────────────────────────────────────
let activeTab = 'live';   // 'live' | 'devices' | 'stats' | 'attacks'

// ── Devices inventory ────────────────────────────────────────────────────────
// Map keyed by MAC (or IP if no MAC). entry = {
//   mac, ip, vendor, icon, hostname?, role, firstSeen, lastSeen, packets, bytes,
//   inPackets, outPackets, isLocal
// }
const devices = new Map();
let devicesDirty = false;

// Track which IPs are "ours" (came from localIPs)
const localIPSet = new Set();
let gatewayIP = null;        // best-guess gateway (from arp/router-bound traffic) — kept simple

function touchDevice(mac, ip, fromUs, pkt) {
  // Skip multicast/broadcast/zero MACs
  if (!mac || isMulticast(mac)) return null;
  const key = mac.toLowerCase();
  let d = devices.get(key);
  const now = Date.now();
  if (!d) {
    const vendor = lookupVendor(mac);
    d = {
      mac: mac.toLowerCase(),
      ip: ip || null,
      vendor: vendor || null,
      icon: iconForVendor(vendor),
      hostname: null,
      role: null,
      firstSeen: now,
      lastSeen: now,
      packets: 0, bytes: 0,
      inPackets: 0, outPackets: 0,
      isLocal: false,
    };
    devices.set(key, d);
    devicesDirty = true;
  }
  if (ip && d.ip !== ip) { d.ip = ip; devicesDirty = true; }
  if (fromUs) d.outPackets++;
  else        d.inPackets++;
  d.packets++;
  d.bytes += (pkt?.size || 0);
  d.lastSeen = now;
  if (localIPSet.has(d.ip)) d.isLocal = true;
  return d;
}

// ── Statistics aggregates ─────────────────────────────────────────────────────
const sessionStats = {
  startTime: null,
  totalPackets: 0,
  totalBytes: 0,
  byHost: new Map(),         // host → { bytes, packets }
  byProtocol: new Map(),     // proto → { bytes, packets }
  byTag: new Map(),          // classifier tag → count
  uniqueHosts: new Set(),
  uniqueIPs: new Set(),
};

function updateSessionStats(pkt) {
  if (!sessionStats.startTime) sessionStats.startTime = Date.now();
  sessionStats.totalPackets++;
  sessionStats.totalBytes += pkt.size || 0;
  // By host (use host or remote IP)
  const remote = pkt.direction === 'in' ? (pkt.host || pkt.src) : (pkt.host || pkt.dst);
  if (remote) {
    sessionStats.uniqueHosts.add(remote);
    let h = sessionStats.byHost.get(remote);
    if (!h) { h = { bytes: 0, packets: 0 }; sessionStats.byHost.set(remote, h); }
    h.bytes += pkt.size || 0; h.packets++;
  }
  // By protocol
  if (pkt.protocol) {
    let p = sessionStats.byProtocol.get(pkt.protocol);
    if (!p) { p = { bytes: 0, packets: 0 }; sessionStats.byProtocol.set(pkt.protocol, p); }
    p.bytes += pkt.size || 0; p.packets++;
  }
  // By classifier tag
  if (pkt._class?.tag) {
    sessionStats.byTag.set(pkt._class.tag, (sessionStats.byTag.get(pkt._class.tag) || 0) + 1);
  }
  // Track remote IP
  sessionStats.uniqueIPs.add(pkt.direction === 'in' ? pkt.src : pkt.dst);
}

// ── Defense state (mirrored from main) ────────────────────────────────────────
let defenseMode = 'off';           // 'off' | 'detect' | 'block'
const attackingIPs = new Set();    // IPs currently flagged
const confirmedIPs = new Set();    // confirmed sustained attackers
const blockedIPs = new Set();      // IPs blocked by firewall
let captureStartedByDefense = false;  // true if capture was auto-started for defense

// Attack history (ordered, oldest first)
// entry = { id, ip, type, severity, pps, since, ended, endedAt, confirmed, confirmedAt, blocked, blockedAt }
const attackLog = [];
const attackById = new Map();      // ip → most-recent entry (active or recently ended)
let attackLogDirty = false;
let logFilter = 'all';
const ATTACK_LOG_MAX = 200;        // hard cap to keep DOM render cheap
const ATTACK_REUSE_WINDOW_MS = 5 * 60 * 1000;   // re-detect of same IP within 5 min reuses entry

// Grid background lines (cached)
let gridCanvas = null;
function rebuildGrid() {
  gridCanvas = document.createElement('canvas');
  gridCanvas.width = canvas.width;
  gridCanvas.height = canvas.height;
  const g = gridCanvas.getContext('2d');
  g.strokeStyle = 'rgba(30,60,100,0.25)';
  g.lineWidth = 1;
  const step = 40;
  for (let x = 0; x < canvas.width; x += step) {
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, canvas.height); g.stroke();
  }
  for (let y = 0; y < canvas.height; y += step) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(canvas.width, y); g.stroke();
  }
}

function drawOverlay() {
  const W = canvas.width, H = canvas.height;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.04)';
  for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
  const vg = ctx.createRadialGradient(W/2, H/2, H*0.3, W/2, H/2, H*0.8);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,20,0.5)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// ── Render loop ──────────────────────────────────────────────────────────────
function loop(now) {
  const dt = Math.min(now - lastTime, 100);
  lastTime = now;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (gridCanvas) ctx.drawImage(gridCanvas, 0, 0);

  character.update(dt);
  particles.update(dt);

  if (particles.checkArrivals() && defenseMode === 'off') {
    character.setState('receive');
  }

  particles.draw(ctx);
  character.draw(ctx);
  drawOverlay();

  // Throttled list/stats rendering
  if (listDirty && now - lastListRender >= LIST_RENDER_INTERVAL) {
    renderPacketList();
    lastListRender = now;
    listDirty = false;
  }
  if (now - lastStatsRender >= STATS_RENDER_INTERVAL) {
    updateStats();
    updateLogSize();
    lastStatsRender = now;
    // Tab-specific live refreshes
    if (activeTab === 'attacks' && attackLog.some(e => !e.ended)) renderAttackLog();
    if (activeTab === 'devices' && devicesDirty) renderDevicesTab();
    if (activeTab === 'stats') renderStatsTab();
  }

  requestAnimationFrame(loop);
}

// ── Batch packet handler ──────────────────────────────────────────────────────
function handlePacketBatch(pkts) {
  let inCount = 0, outCount = 0;

  for (const pkt of pkts) {
    pkt._id = pktAutoId++;

    // Learn IP → host bindings BEFORE enrichment so this batch can self-resolve
    const remoteIP = pkt.direction === 'in' ? pkt.src : pkt.dst;
    if (pkt.sni)            cacheHost(remoteIP, pkt.sni);
    else if (pkt.httpHost)  cacheHost(remoteIP, pkt.httpHost);

    // DNS responses: map every answered IP to the queried name.
    // (we only capture the first A/AAAA via -E occurrence=f, but that's enough)
    if (pkt.dnsName) {
      if (pkt.dnsA)    cacheHost(pkt.dnsA,    pkt.dnsName);
      if (pkt.dnsAAAA) cacheHost(pkt.dnsAAAA, pkt.dnsName);
    }

    // If this packet has no host info, use what we've learned for its remote IP
    if (!pkt.host && remoteIP) {
      const cached = ipToHostCache.get(remoteIP);
      if (cached) pkt.host = cached;
    }

    pkt._class = classifyPacket(pkt);
    if (pkt.direction === 'in') {
      stats.inBytes += pkt.size; stats.inCount++; inCount++;
    } else {
      stats.outBytes += pkt.size; stats.outCount++; outCount++;
    }

    // Devices inventory — record both ends. The "remote" side is the device
    // we actually want to inventory; the local side we tag as our own.
    if (pkt.direction === 'in') {
      touchDevice(pkt.ethSrc, pkt.src, false, pkt);   // remote sender
      touchDevice(pkt.ethDst, pkt.dst, true,  pkt);   // us
    } else {
      touchDevice(pkt.ethSrc, pkt.src, true,  pkt);   // us
      touchDevice(pkt.ethDst, pkt.dst, false, pkt);   // remote receiver
    }

    // Session-wide statistics
    updateSessionStats(pkt);
  }

  // Prepend new packets; trim cap
  if (pkts.length >= MAX_PACKETS) {
    packets = pkts.slice(-MAX_PACKETS).reverse();
  } else {
    packets = pkts.slice().reverse().concat(packets);
    if (packets.length > MAX_PACKETS) packets.length = MAX_PACKETS;
  }
  listDirty = true;

  // Spawn particles (sampled if too many)
  // Prioritize attack packets so user always sees the demon icons
  const attackPkts = defenseMode !== 'off' ? pkts.filter(p => p.direction === 'in' && attackingIPs.has(p.src)) : [];
  const normalPkts = defenseMode !== 'off' ? pkts.filter(p => !(p.direction === 'in' && attackingIPs.has(p.src))) : pkts;

  const available = Math.max(0, MAX_PARTICLES - particles.particles.length);
  let budget = Math.min(MAX_SPAWN_PER_BATCH, available);

  // Always show attack particles first (up to half the budget)
  const attackBudget = Math.min(attackPkts.length, Math.max(2, Math.floor(budget / 2)));
  for (let i = 0; i < attackBudget; i++) {
    const p = attackPkts[i];
    particles.spawn({
      direction: 'in',
      charX: character.x, charY: character.y,
      canvasW: canvas.width, canvasH: canvas.height,
      protocol: p.protocol, host: p.host, size: p.size,
      remoteIP: p.direction === 'in' ? p.src : p.dst,
      attack: true,
    });
    budget--;
  }

  // Then normal particles, sampled
  if (budget > 0 && normalPkts.length > 0) {
    const step = Math.max(1, Math.floor(normalPkts.length / budget));
    let spawned = 0;
    for (let i = 0; i < normalPkts.length && spawned < budget; i += step) {
      const p = normalPkts[i];
      particles.spawn({
        direction: p.direction,
        charX: character.x, charY: character.y,
        canvasW: canvas.width, canvasH: canvas.height,
        protocol: p.protocol, host: p.host, size: p.size,
        remoteIP: p.direction === 'in' ? p.src : p.dst,
        attack: false,
      });
      spawned++;
    }
  }

  // Character state policy:
  //   - Defense mode ON: stay in defense_idle. Only switch to 'hurt' when attacked
  //     ('block' state is handled by onAttackConfirmed when sustained attack happens).
  //   - Defense mode OFF: normal receive/send animations on traffic.
  if (defenseMode !== 'off') {
    if (attackBudget > 0) character.setState('hurt');
    // else: keep defense_idle (don't trigger receive/send)
  } else {
    if (inCount > outCount) character.setState('receive');
    else if (outCount > 0) character.setState('send');
  }
}

// ── Packet list UI ────────────────────────────────────────────────────────────
const packetList = document.getElementById('packetList');

const PROTO_COLOR = {
  HTTP: '#4caf50', HTTPS: '#2196f3', DNS: '#ff9800',
  TCP: '#9c27b0', UDP: '#00bcd4', ICMP: '#f44336',
  SSH: '#e91e63', default: '#78909c',
};

function renderPacketList() {
  const frag = document.createDocumentFragment();

  // Compile search query once per render (supports wildcards / CIDR / field:value)
  const q = (listSearchQuery || '').trim();
  let candidates;
  if (q) {
    const matches = compileQuery(q);
    candidates = [];
    for (const p of packets) {
      if (matches(p)) candidates.push(p);
      if (candidates.length >= MAX_RENDER_ROWS) break;
    }
  } else {
    candidates = packets.slice(0, MAX_RENDER_ROWS);
  }

  updateListCounter(candidates.length, q ? packets.length : null);

  const visible = candidates;
  for (const p of visible) {
    const row = document.createElement('div');
    row.className = 'packet-row';
    row.dataset.id = p._id;
    if (p._id === selectedPacketIdx) row.classList.add('selected');

    // Direction arrow
    const dirEl = document.createElement('span');
    dirEl.className = 'pkt-dir';
    dirEl.style.color = p.direction === 'in' ? '#4cffaa' : '#ff6644';
    dirEl.textContent = p.direction === 'in' ? '↓' : '↑';
    row.appendChild(dirEl);

    // Size (now to the LEFT of host/IP, right-aligned)
    const sizeEl = document.createElement('span');
    sizeEl.className = 'pkt-size';
    sizeEl.textContent = p.size < 1024 ? `${p.size}B` : `${(p.size/1024).toFixed(1)}K`;
    row.appendChild(sizeEl);

    // Host / IP (dominant left-aligned column)
    const labelEl = document.createElement('span');
    labelEl.className = 'pkt-label';
    labelEl.textContent = p.host || (p.direction === 'in' ? p.src : p.dst);
    labelEl.title = `${p.src}:${p.tcpSrcPort || p.udpSrcPort || '?'} → ${p.dst}:${p.tcpDstPort || p.udpDstPort || '?'}`;
    row.appendChild(labelEl);

    // Classification tag (icon + short label, dim)
    const tagEl = document.createElement('span');
    tagEl.className = 'pkt-tag';
    if (p._class) {
      const label = t(p._class.labelKey);
      tagEl.textContent = `${p._class.icon} ${label}${p._class.extra ? ' ' + p._class.extra : ''}`;
      tagEl.title = `proto=${p.protocol}  tag=${p._class.tag}`;
    }
    row.appendChild(tagEl);

    // Time (dim, far right)
    const timeEl = document.createElement('span');
    timeEl.className = 'pkt-time';
    timeEl.textContent = new Date(p.time).toTimeString().slice(0, 8);
    row.appendChild(timeEl);

    frag.appendChild(row);
  }
  packetList.replaceChildren(frag);
}

// Keyboard shortcuts:
//   Space = toggle capture
//   D = open detail for top packet
//   Esc = close detail panel
//   ↑/↓ = navigate selected packet
window.addEventListener('keydown', (e) => {
  // Don't intercept if focus is in an input field
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

  if (e.key === ' ' || e.code === 'Space') {
    e.preventDefault();
    btnCapture.click();
  } else if (e.key === 'd' || e.key === 'D') {
    if (packets.length > 0) {
      const pkt = packets[0];
      selectedPacketIdx = pkt._id;
      listDirty = true;
      showDetail(pkt);
    }
  } else if (e.key === 'Escape') {
    // ESC priority: detail panel selection first, then jump back to Live tab
    if (selectedPacketIdx !== null) {
      closeDetailBtn.click();
      listDirty = true;
    } else if (activeTab !== 'live') {
      switchTab('live');
    }
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (packets.length === 0) return;
    e.preventDefault();
    let idx = packets.findIndex(p => p._id === selectedPacketIdx);
    if (idx === -1) idx = 0;
    else idx = e.key === 'ArrowDown' ? Math.min(idx + 1, packets.length - 1) : Math.max(idx - 1, 0);
    selectedPacketIdx = packets[idx]._id;
    listDirty = true;
    showDetail(packets[idx]);
  }
});

// Click handler (event delegation)
packetList.addEventListener('click', (e) => {
  const row = e.target.closest('.packet-row');
  if (!row) return;
  const id = parseInt(row.dataset.id);
  const pkt = packets.find(p => p._id === id);
  if (!pkt) return;
  selectedPacketIdx = id;
  // Mark selected without full re-render
  packetList.querySelectorAll('.packet-row.selected').forEach(r => r.classList.remove('selected'));
  row.classList.add('selected');
  showDetail(pkt);
});

// ── In-memory packet search ─────────────────────────────────────────────────
const listSearchInput = document.getElementById('listSearch');
const btnClearSearch  = document.getElementById('btnClearSearch');
const btnLoadHistory  = document.getElementById('btnLoadHistory');
const btnClearLogs    = document.getElementById('btnClearLogs');

// ── Clear saved logs from disk (uses native confirm dialog in main process) ─
function fmtBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024*1024) return `${(b/1024).toFixed(1)} KB`;
  return `${(b/1024/1024).toFixed(1)} MB`;
}

btnClearLogs.addEventListener('click', async () => {
  btnClearLogs.disabled = true;
  try {
    const res = await api.logClear();
    if (!res?.confirmed) {
      // Cancelled or no logs — show the reason briefly
      if (res?.reason === 'empty') {
        statusBar.textContent = t('logs_clear_empty') || res.message || '';
        statusBar.style.color = '#88aaff';
      }
      return;
    }
    // Show success in status bar
    statusBar.textContent =
      `✓ ${t('logs_cleared_ok') || 'Cleared'} ${res.deleted} ${t('logs_cleared_files') || 'files,'} ${t('logs_cleared_freed') || 'freed'} ${fmtBytes(res.bytes)}`;
    statusBar.style.color = '#4cffaa';
    // Refresh the disk-usage indicator next to the panel header
    updateLogSize();
  } catch (e) {
    statusBar.textContent = `Error: ${e.message}`;
    statusBar.style.color = '#ff4444';
  } finally {
    btnClearLogs.disabled = false;
  }
});

let listSearchTimer = null;
listSearchInput.addEventListener('input', () => {
  if (listSearchTimer) clearTimeout(listSearchTimer);
  listSearchTimer = setTimeout(() => {
    listSearchQuery = listSearchInput.value;
    listDirty = true;
  }, 80);
});
btnClearSearch.addEventListener('click', () => {
  listSearchInput.value = '';
  listSearchQuery = '';
  listDirty = true;
  listSearchInput.focus();
});

// "Load from disk" — pulls recent packets out of the current session log
// (or the most recent log file if no capture is active) and prepends them
// to the in-memory buffer so the user can search through more history.
btnLoadHistory.addEventListener('click', async () => {
  btnLoadHistory.disabled = true;
  const originalText = btnLoadHistory.textContent;
  btnLoadHistory.textContent = t('list_loading');
  try {
    const info = await api.logInfo();
    let target = info?.path;
    if (!target) {
      // Fallback: pick newest log file on disk
      const list = await api.logList();
      target = list?.[0]?.path;
    }
    if (!target) {
      btnLoadHistory.textContent = t('list_log_disabled');
      setTimeout(() => { btnLoadHistory.textContent = originalText; }, 1500);
      return;
    }
    // Pull up to 5000 entries matching the current search (or all if empty)
    const loaded = await api.logSearch({ file: target, query: listSearchQuery, limit: 5000 });
    if (loaded?.length) {
      // Merge by frame number to avoid duplicates with live buffer
      const seenFrames = new Set(packets.map(p => p.frame));
      const fresh = [];
      for (const p of loaded) {
        if (!seenFrames.has(p.frame)) {
          p._id = pktAutoId++;
          p._class = classifyPacket(p);
          fresh.push(p);
        }
      }
      // loaded came newest-first; append to current (which is also newest-first)
      packets = packets.concat(fresh).slice(0, MAX_PACKETS);
      listDirty = true;
      btnLoadHistory.textContent = `${t('list_loaded')} +${fresh.length}`;
    } else {
      btnLoadHistory.textContent = `${t('list_loaded')} 0`;
    }
  } catch (e) {
    btnLoadHistory.textContent = `Error: ${e.message}`;
  } finally {
    setTimeout(() => { btnLoadHistory.textContent = originalText; btnLoadHistory.disabled = false; }, 1500);
  }
});

// ── Context menu (right-click on packet list) ───────────────────────────────
const contextMenu = document.getElementById('contextMenu');
let ctxPacket = null;   // packet under cursor when menu opened

function hideContextMenu() {
  contextMenu.classList.add('hidden');
  ctxPacket = null;
}

function showContextMenu(x, y, pkt) {
  ctxPacket = pkt;
  contextMenu.classList.remove('hidden');
  // Position, keeping inside viewport
  const rect = contextMenu.getBoundingClientRect();
  const W = window.innerWidth, H = window.innerHeight;
  const px = Math.min(x, W - rect.width - 4);
  const py = Math.min(y, H - rect.height - 4);
  contextMenu.style.left = `${px}px`;
  contextMenu.style.top  = `${py}px`;

  // Disable items that need a packet
  contextMenu.querySelectorAll('.ctx-item').forEach(el => {
    const act = el.dataset.action;
    const needsPkt = act !== 'clear';
    el.style.opacity = (needsPkt && !pkt) ? '0.4' : '1';
    el.style.pointerEvents = (needsPkt && !pkt) ? 'none' : '';
  });
}

packetList.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const row = e.target.closest('.packet-row');
  const id = row ? parseInt(row.dataset.id) : null;
  const pkt = id ? packets.find(p => p._id === id) : null;
  showContextMenu(e.clientX, e.clientY, pkt);
});

window.addEventListener('click', (e) => {
  if (!contextMenu.contains(e.target)) hideContextMenu();
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !contextMenu.classList.contains('hidden')) {
    hideContextMenu();
  }
});

function packetToTSV(p) {
  const time = new Date(p.time).toTimeString().slice(0, 8);
  const dir = p.direction === 'in' ? '↓' : '↑';
  return `${time}\t${dir}\t${p.protocol}\t${p.src}:${p.tcpSrcPort||p.udpSrcPort||''}\t${p.dst}:${p.tcpDstPort||p.udpDstPort||''}\t${p.size}B\t${p.host||''}`;
}

contextMenu.addEventListener('click', async (e) => {
  const item = e.target.closest('.ctx-item');
  if (!item) return;
  const action = item.dataset.action;
  const p = ctxPacket;
  hideContextMenu();

  switch (action) {
    case 'copy-row':
      if (p) await navigator.clipboard.writeText(packetToTSV(p));
      break;
    case 'copy-host':
      if (p) await navigator.clipboard.writeText(p.host || p.src || '');
      break;
    case 'copy-src':
      if (p) await navigator.clipboard.writeText(p.src || '');
      break;
    case 'copy-dst':
      if (p) await navigator.clipboard.writeText(p.dst || '');
      break;
    case 'copy-json':
      if (p) await navigator.clipboard.writeText(JSON.stringify(p, null, 2));
      break;
    case 'block-src':
      if (p?.src) {
        const res = await api.blockIP(p.src);
        if (res?.ok) {
          blockedIPs.add(p.src);
          updateDefenseStatus();
        }
      }
      break;
    case 'tag-brand': {
      if (!p) break;
      const remoteIP = p.direction === 'in' ? p.src : p.dst;
      if (remoteIP) openBrandPicker(remoteIP);
      break;
    }
    case 'untag-brand': {
      if (!p) break;
      const remoteIP = p.direction === 'in' ? p.src : p.dst;
      if (!remoteIP) break;
      ipToHostCache.delete(remoteIP);
      // Tell main to remove from persistent cache by overwriting with empty
      // (we can't truly delete via batch; use a dedicated clear-one IPC)
      if (window.wirechar?.iphostUnset) {
        await window.wirechar.iphostUnset(remoteIP);
      }
      listDirty = true;
      statusBar.textContent = t('brand_picker_untagged');
      statusBar.style.color = '#88aaff';
      break;
    }
    case 'clear':
      packets = [];
      selectedPacketIdx = null;
      listDirty = true;
      renderPacketList();
      break;
  }
});

// ── Brand picker modal (manual IP→brand tagging) ─────────────────────────────
const brandPickerModal  = document.getElementById('brandPickerModal');
const brandPickerList   = document.getElementById('brandPickerList');
const brandPickerSearch = document.getElementById('brandPickerSearch');
const brandPickerTargetEl = document.getElementById('brandPickerTarget');
let brandPickerTargetIP = null;
let brandPickerFocusIdx = -1;
let brandPickerVisibleItems = [];

function renderBrandPickerList(filter) {
  const q = (filter || '').toLowerCase().trim();
  brandPickerList.innerHTML = '';
  brandPickerVisibleItems = [];
  brandPickerFocusIdx = -1;
  const brands = getAllBrands();
  const frag = document.createDocumentFragment();
  for (const b of brands) {
    if (q && !b.title.toLowerCase().includes(q) && !b.host.toLowerCase().includes(q)) continue;
    const item = document.createElement('div');
    item.className = 'brand-item';
    item.dataset.id = b.id;
    item.innerHTML = `
      <span class="brand-swatch" style="background:${b.hex}"></span>
      <span class="brand-title">${escapeHtml(b.title)}</span>
      <span class="brand-host">${escapeHtml(b.host)}</span>`;
    frag.appendChild(item);
    brandPickerVisibleItems.push(item);
  }
  if (brandPickerVisibleItems.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'brand-empty';
    empty.textContent = t('brand_picker_empty');
    frag.appendChild(empty);
  } else {
    brandPickerFocusIdx = 0;
    brandPickerVisibleItems[0].classList.add('selected');
  }
  brandPickerList.appendChild(frag);
}

function openBrandPicker(ip) {
  brandPickerTargetIP = ip;
  brandPickerTargetEl.textContent = ip;
  brandPickerSearch.value = '';
  renderBrandPickerList('');
  brandPickerModal.classList.remove('hidden');
  setTimeout(() => brandPickerSearch.focus(), 0);
}

function closeBrandPicker() {
  brandPickerModal.classList.add('hidden');
  brandPickerTargetIP = null;
}

async function applyBrandTag(brandId) {
  if (!brandPickerTargetIP || !brandId) return;
  const host = brandCanonicalHost(brandId);
  cacheHost(brandPickerTargetIP, host);
  if (window.wirechar?.iphostBatch) {
    try { await window.wirechar.iphostBatch([[brandPickerTargetIP, host]]); } catch {}
  }
  statusBar.textContent = `${t('brand_picker_tagged')} ${brandPickerTargetIP} → ${host}`;
  statusBar.style.color = '#4cffaa';
  listDirty = true;
  closeBrandPicker();
}

brandPickerList.addEventListener('click', (e) => {
  const item = e.target.closest('.brand-item');
  if (!item) return;
  applyBrandTag(item.dataset.id);
});

brandPickerSearch.addEventListener('input', () => {
  renderBrandPickerList(brandPickerSearch.value);
});

// Keyboard navigation inside the picker
brandPickerSearch.addEventListener('keydown', (e) => {
  if (brandPickerVisibleItems.length === 0) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    brandPickerVisibleItems[brandPickerFocusIdx]?.classList.remove('selected');
    brandPickerFocusIdx = Math.min(brandPickerFocusIdx + 1, brandPickerVisibleItems.length - 1);
    const el = brandPickerVisibleItems[brandPickerFocusIdx];
    el.classList.add('selected');
    el.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    brandPickerVisibleItems[brandPickerFocusIdx]?.classList.remove('selected');
    brandPickerFocusIdx = Math.max(brandPickerFocusIdx - 1, 0);
    const el = brandPickerVisibleItems[brandPickerFocusIdx];
    el.classList.add('selected');
    el.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const el = brandPickerVisibleItems[brandPickerFocusIdx];
    if (el) applyBrandTag(el.dataset.id);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    closeBrandPicker();
  }
});

document.getElementById('brandPickerClose').addEventListener('click', closeBrandPicker);
brandPickerModal.addEventListener('click', (e) => {
  if (e.target === brandPickerModal) closeBrandPicker();
});

// ── Detail panel ──────────────────────────────────────────────────────────────
const detailPanel = document.getElementById('detailPanel');
const detailContent = document.getElementById('detailContent');
const closeDetailBtn = document.getElementById('closeDetail');
const hexContent = document.getElementById('hexContent');

let hexRequestId = 0;

async function showDetail(pkt) {
  detailContent.innerHTML = '';
  detailContent.appendChild(renderDetailPanel(pkt));

  // Fetch hex dump asynchronously (cancellable)
  const myReq = ++hexRequestId;
  hexContent.textContent = t('hex_loading');
  hexContent.classList.remove('hex-error');

  try {
    const res = await api.getHexDump(pkt.frame);
    if (myReq !== hexRequestId) return; // newer request superseded
    if (res?.hex) {
      // Byte-level pattern hint shown above the hex
      const sig = analyzeBytes(res.hex);
      const header = document.getElementById('hexHeader');
      if (sig) {
        const sigLabel = t(sig.labelKey);
        header.innerHTML = `${t('hex_signature_prefix')}<span style="color:#ffcc66">${escapeHtmlClient(sigLabel)}</span>`;
        header.title = `Signature: ${sig.evidence}`;
      } else {
        header.textContent = t('hex_header');
        header.title = '';
      }
      hexContent.innerHTML = formatHexDump(res.hex);
    } else {
      hexContent.textContent = res?.error ? `[${res.error}]` : t('hex_unavailable');
    }
  } catch (e) {
    if (myReq !== hexRequestId) return;
    hexContent.textContent = `[error: ${e.message}]`;
  }
}

// tshark -x outputs lines like:
//   "0000  45 00 00 60 12 34 40 00 40 06 c5 a3 c0 a8 01 0a   E..`.4@.@......."
// Format with subtle coloring.
function formatHexDump(raw) {
  const lines = raw.split('\n').filter(l => l.trim());
  return lines.map(line => {
    const m = line.match(/^([0-9a-fA-F]+)\s{2,}([0-9a-fA-F\s]+?)\s{2,}(.*)$/);
    if (!m) return `<span class="hex-line">${escapeHtmlClient(line)}</span>`;
    return `<span class="hex-line"><span class="hex-offset">${m[1]}</span><span class="hex-bytes">${escapeHtmlClient(m[2])}</span><span class="hex-ascii">${escapeHtmlClient(m[3])}</span></span>`;
  }).join('\n');
}
function escapeHtmlClient(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

closeDetailBtn.addEventListener('click', () => {
  selectedPacketIdx = null;
  detailContent.innerHTML = `<div class="detail-placeholder">${t('detail_placeholder')}</div>`;
  hexContent.textContent = t('hex_placeholder');
  hexRequestId++;
  packetList.querySelectorAll('.packet-row.selected').forEach(r => r.classList.remove('selected'));
});

// ── Stats ─────────────────────────────────────────────────────────────────────
let lastSampleTime = Date.now();
let lastSampleBytes = 0;
let currentRate = 0;

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function updateStats() {
  const now = Date.now();
  const totalBytes = stats.inBytes + stats.outBytes;
  const dt = (now - lastSampleTime) / 1000;
  if (dt >= 1) {
    currentRate = (totalBytes - lastSampleBytes) / dt;
    lastSampleBytes = totalBytes;
    lastSampleTime = now;
  }
  document.getElementById('statIn').textContent = `↓ ${formatBytes(stats.inBytes)} (${stats.inCount})`;
  document.getElementById('statOut').textContent = `↑ ${formatBytes(stats.outBytes)} (${stats.outCount})`;
  document.getElementById('statRate').textContent = `${formatBytes(currentRate)}/s`;
  document.getElementById('statParticles').textContent = `particles: ${particles?.particles.length || 0}`;
}

// ── Device selector ───────────────────────────────────────────────────────────
const deviceSelect = document.getElementById('deviceSelect');
const btnCapture = document.getElementById('btnCapture');
const statusBar = document.getElementById('statusBar');

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function populateDevices() {
  const { devices: ifaceDevices, localIPs, available, isAdmin } = await api.getDevices();
  // Cache local IPs so the devices inventory can flag "this device" rows
  localIPSet.clear();
  if (localIPs) for (const ip of localIPs) localIPSet.add(ip);
  const devices = ifaceDevices;

  if (!available) {
    statusBar.textContent = t('status_no_tshark');
    statusBar.style.color = '#ff4444';
    deviceSelect.innerHTML = `<option>${escapeHtml(t('status_no_tshark'))}</option>`;
    return;
  }

  if (!isAdmin) {
    statusBar.textContent = t('status_no_admin');
    statusBar.style.color = '#ff9900';
  } else {
    statusBar.textContent = t('status_ready_admin');
    statusBar.style.color = '#4cffaa';
  }

  const ipv4 = localIPs.find(ip => /^\d+\.\d+\.\d+\.\d+$/.test(ip));
  document.getElementById('localIPBadge').textContent = ipv4 || localIPs[0] || '—.—.—.—';

  if (!devices || devices.length === 0) {
    statusBar.textContent = t('status_no_devices');
    deviceSelect.innerHTML = `<option>${escapeHtml(t('status_no_devices'))}</option>`;
    return;
  }

  deviceSelect.innerHTML = devices.map(d =>
    `<option value="${escapeHtml(d.name)}">${escapeHtml(d.description || d.name)}</option>`
  ).join('');
  selectedDevice = devices[0].name;
}

deviceSelect.addEventListener('change', () => { selectedDevice = deviceSelect.value; });

btnCapture.addEventListener('click', async () => {
  if (!capturing) {
    if (!selectedDevice) {
      statusBar.textContent = t('status_select_iface');
      return;
    }
    const ok = await api.startCapture(selectedDevice, currentFilter);
    if (ok) {
      capturing = true;
      captureStartedByDefense = false;     // user explicitly started → not defense-owned
      btnCapture.textContent = t('capture_stop');
      btnCapture.classList.add('active');
      stats = { inBytes: 0, outBytes: 0, inCount: 0, outCount: 0, startTime: Date.now() };
      lastSampleBytes = 0;
      lastSampleTime = Date.now();
      packets = [];
      listDirty = true;
    }
  } else {
    await api.stopCapture();
    capturing = false;
    captureStartedByDefense = false;
    btnCapture.textContent = t('capture_start');
    btnCapture.classList.remove('active');
    statusBar.textContent = t('status_capture_stopped');
    statusBar.style.color = '#78909c';
  }
});

// ── Helper: ensure capture is running (used by defense mode) ─────────────────
async function ensureCaptureRunning() {
  if (capturing) return true;
  if (!selectedDevice) {
    statusBar.textContent = t('defense_no_iface');
    statusBar.style.color = '#ff9900';
    return false;
  }
  const ok = await api.startCapture(selectedDevice, currentFilter);
  if (ok) {
    capturing = true;
    captureStartedByDefense = true;
    btnCapture.textContent = t('capture_stop');
    btnCapture.classList.add('active');
    stats = { inBytes: 0, outBytes: 0, inCount: 0, outCount: 0, startTime: Date.now() };
    lastSampleBytes = 0; lastSampleTime = Date.now();
    packets = [];
    listDirty = true;
    return true;
  } else {
    statusBar.textContent = t('defense_no_tshark');
    statusBar.style.color = '#ff4444';
    return false;
  }
}

async function maybeStopAutoCapture() {
  if (capturing && captureStartedByDefense) {
    await api.stopCapture();
    capturing = false;
    captureStartedByDefense = false;
    btnCapture.textContent = t('capture_start');
    btnCapture.classList.remove('active');
    statusBar.textContent = t('status_capture_stopped');
    statusBar.style.color = '#78909c';
  }
}

// ── Filter (Wireshark display filter, passed to tshark -Y) ────────────────────
const filterInput = document.getElementById('filterInput');
let currentFilter = '';

async function applyFilter() {
  const newFilter = filterInput.value.trim();
  if (newFilter === currentFilter) return;
  currentFilter = newFilter;
  filterInput.classList.remove('filter-error', 'filter-ok');
  if (!capturing) {
    filterInput.classList.add(newFilter ? 'filter-ok' : '');
    return;
  }
  statusBar.textContent = `${t('status_filter_applying')} ${newFilter || t('status_filter_none')}…`;
  statusBar.style.color = '#88aaff';
  const res = await api.applyFilter(newFilter);
  if (res?.ok) {
    filterInput.classList.add('filter-ok');
    // Reset stats and packet list when filter changes
    stats = { inBytes: 0, outBytes: 0, inCount: 0, outCount: 0, startTime: Date.now() };
    lastSampleBytes = 0;
    lastSampleTime = Date.now();
    packets = [];
    listDirty = true;
  } else {
    filterInput.classList.add('filter-error');
  }
}

filterInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    applyFilter();
  }
});
// Apply on blur if changed (no debounce typing — avoid restarts on every keystroke)
filterInput.addEventListener('blur', applyFilter);

// ── IPC listeners ─────────────────────────────────────────────────────────────
api.onPackets(handlePacketBatch);
api.onCaptureError((msg) => {
  statusBar.textContent = `${t('status_error_prefix')} ${msg}`;
  statusBar.style.color = '#ff4444';
  capturing = false;
  btnCapture.textContent = t('capture_start');
  btnCapture.classList.remove('active');
});
api.onCaptureStarted((device) => {
  statusBar.textContent = `${t('status_capturing_on')} ${device}`;
  statusBar.style.color = '#4cffaa';
});

if (api.onCaptureRestarting) {
  api.onCaptureRestarting((info) => {
    const code = info?.lastCode ?? '?';
    statusBar.textContent = `↻ ${t('status_restarted_code')} ${code})`;
    statusBar.style.color = '#ffaa44';
    console.warn('[capture] auto-restart after exit code', code);
  });
}

// ── Defense mode + attack events ──────────────────────────────────────────────
const modeSelect = document.getElementById('modeSelect');
const defenseStatus = document.getElementById('defenseStatus');

// Tray menu can change defense mode while window is hidden — react to it.
if (window.wirechar?.onDefenseModeChanged) {
  window.wirechar.onDefenseModeChanged((mode) => {
    if (mode !== defenseMode) applyDefenseMode(mode, /*persist*/ false);
  });
}

modeSelect.addEventListener('change', () => applyDefenseMode(modeSelect.value, /*persist*/ true));

async function applyDefenseMode(mode, persist) {
  defenseMode = mode;
  await api.setDefenseMode(defenseMode);
  modeSelect.value = mode;
  modeSelect.classList.toggle('mode-detect', defenseMode === 'detect');
  modeSelect.classList.toggle('mode-block', defenseMode === 'block');

  if (character) {
    character.setDefenseMode(defenseMode !== 'off');
    if (defenseMode === 'off') character.setSustainedBlock(false);
  }

  if (defenseMode === 'off') {
    // Tear down auto-capture but leave user-initiated capture alone
    await maybeStopAutoCapture();
    attackingIPs.clear();
    confirmedIPs.clear();
    defenseStatus.textContent = '';
    defenseStatus.className = '';
  } else {
    // Defense needs traffic — auto-start capture if user hasn't
    const ok = await ensureCaptureRunning();
    if (ok && captureStartedByDefense) {
      statusBar.textContent = `${t('defense_auto_start')} ${selectedDevice || ''}`;
      statusBar.style.color = '#4cffaa';
    }
    updateDefenseStatus();
  }

  // Persist user preference so always-on protection survives restarts
  if (persist && window.wirechar?.setSetting) {
    try { await window.wirechar.setSetting('defenseMode', defenseMode); } catch {}
  }
}

function updateDefenseStatus() {
  const n = attackingIPs.size;
  const b = blockedIPs.size;
  if (n === 0 && b === 0) {
    defenseStatus.textContent = t('defense_clear');
    defenseStatus.className = '';
  } else {
    defenseStatus.textContent = `⚠ ${n} ${t('defense_attacking')}${b > 0 ? `, ${b} ${t('defense_blocked')}` : ''}`;
    defenseStatus.className = b > 0 ? 'blocked' : 'alert';
  }
  // Toggle View button visibility — show if anything in log
  const btn = document.getElementById('btnViewLog');
  const activeCount = attackLog.filter(e => !e.ended).length;
  const total = attackLog.length;
  if (btn) {
    if (total === 0) {
      btn.classList.add('hidden');
    } else {
      btn.classList.remove('hidden');
      btn.innerHTML = `${t('log_view_btn')}<span class="log-count">${activeCount || total}</span>`;
    }
  }
  // Update attack badge on tab bar
  const badgeEl = document.getElementById('attacksBadge');
  if (badgeEl) {
    const activeAttacks = attackLog.filter(e => !e.ended).length;
    if (activeAttacks > 0) {
      badgeEl.textContent = String(activeAttacks);
      badgeEl.classList.add('show');
    } else {
      badgeEl.classList.remove('show');
    }
  }
  // Re-render attacks pane if active
  if (activeTab === 'attacks' && attackLogDirty) renderAttackLog();
}

// ── Attack log (now lives in the 'attacks' tab) ──────────────────────────────
const logListEl = document.getElementById('attackLogList');
const logFilterSel = document.getElementById('logFilter');

const ATK_TYPE_KEY = {
  flood: 'atk_flood',
  syn_flood: 'atk_syn_flood',
  port_scan: 'atk_port_scan',
  icmp_flood: 'atk_icmp_flood',
};
const ATK_TYPE_ICON = {
  flood: '🌊',
  syn_flood: '🔥',
  port_scan: '🔍',
  icmp_flood: '🏓',
};

function fmtDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return `${m}m ${rs}s`;
}

function renderAttackLog() {
  attackLogDirty = false;
  if (activeTab !== 'attacks') return;
  logListEl.innerHTML = '';

  // Filter
  const filtered = attackLog.filter(e => {
    switch (logFilter) {
      case 'active':    return !e.ended;
      case 'confirmed': return e.confirmed;
      case 'blocked':   return e.blocked;
      case 'ended':     return e.ended;
      default:          return true;
    }
  });

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'log-empty';
    empty.textContent = t('log_empty');
    logListEl.appendChild(empty);
    return;
  }

  // Header row
  const header = document.createElement('div');
  header.className = 'log-row header';
  header.innerHTML = `
    <span></span>
    <span>${t('log_col_ip')}</span>
    <span>${t('log_col_type')}</span>
    <span>${t('log_col_rate')}</span>
    <span>${t('log_col_severity')}</span>
    <span>${t('log_col_status')}</span>
    <span>${t('log_col_action')} / ${t('log_col_duration')}</span>`;
  logListEl.appendChild(header);

  const now = Date.now();
  // Newest first
  for (let i = filtered.length - 1; i >= 0; i--) {
    const e = filtered[i];
    const row = document.createElement('div');
    row.className = 'log-row' + (e.ended ? ' ended' : '');

    const dur = (e.ended ? e.endedAt : now) - e.since;

    let statusKey = 'log_status_active';
    let statusClass = 'active';
    if (e.ended)          { statusKey = 'log_status_ended';     statusClass = 'ended'; }
    else if (e.blocked)   { statusKey = 'log_status_blocked';   statusClass = 'blocked'; }
    else if (e.confirmed) { statusKey = 'log_status_confirmed'; statusClass = 'confirmed'; }

    const typeLabel = t(ATK_TYPE_KEY[e.type] || 'atk_flood');
    const typeIcon  = ATK_TYPE_ICON[e.type] || '⚠️';

    const reopenBadge = (e.reopens > 0) ? `<span style="color:#aa88ff;font-size:9px;margin-left:4px">×${e.reopens + 1}</span>` : '';

    // Resolve learned host → brand for this IP (gives users context: "this is Discord")
    const learnedHost = ipToHostCache.get(e.ip);
    const brand = learnedHost ? findBrand(learnedHost) : null;
    const brandLine = brand
      ? `<div class="log-brand"><span class="brand-swatch" style="background:${brand.hex}"></span>${escapeHtml(brand.title || brand.id || '')} <span class="log-brand-host">${escapeHtml(learnedHost)}</span></div>`
      : (learnedHost ? `<div class="log-brand"><span class="log-brand-host">${escapeHtml(learnedHost)}</span></div>` : '');

    // Whitelisted entries get their own status badge regardless of attack state
    if (e.whitelisted) { statusKey = 'log_status_whitelisted'; statusClass = 'whitelisted'; }

    row.innerHTML = `
      <span class="log-icon">${typeIcon}</span>
      <span class="log-ip-cell">
        <span class="log-ip">${escapeHtml(e.ip)}${reopenBadge}</span>
        ${brandLine}
      </span>
      <span class="log-type">${escapeHtml(typeLabel)}</span>
      <span class="log-rate">${e.pps.toFixed(0)} pps</span>
      <span class="log-severity">${'★'.repeat(Math.max(1, Math.min(5, Math.round(e.severity))))}</span>
      <span class="log-status ${statusClass}">${t(statusKey)}</span>
      <span class="log-actions">
        ${e.whitelisted ? '' : `<button data-act="whitelist" data-ip="${escapeHtml(e.ip)}">${t('log_action_whitelist')}</button>`}
        ${e.blocked
          ? `<button data-act="unblock" data-ip="${escapeHtml(e.ip)}" class="danger">${t('log_action_unblock')}</button>`
          : `<button data-act="block"   data-ip="${escapeHtml(e.ip)}" class="danger">${t('log_action_block')}</button>`}
        <button data-act="copy" data-ip="${escapeHtml(e.ip)}">${t('log_action_copy')}</button>
        <span style="color:var(--text-dim);font-size:9px;align-self:center">${fmtDuration(dur)}</span>
      </span>`;
    logListEl.appendChild(row);
  }
}

// Event delegation for action buttons
logListEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const ip = btn.dataset.ip;
  const act = btn.dataset.act;
  if (act === 'copy') {
    try { await navigator.clipboard.writeText(ip); } catch {}
  } else if (act === 'block') {
    const res = await api.blockIP(ip);
    if (res?.ok) {
      blockedIPs.add(ip);
      const entry = attackById.get(ip) || attackLog.find(x => x.ip === ip && !x.ended);
      if (entry) { entry.blocked = true; entry.blockedAt = Date.now(); }
      updateDefenseStatus();
      renderAttackLog();
    }
  } else if (act === 'unblock') {
    await api.unblockIP(ip);
    blockedIPs.delete(ip);
    for (const entry of attackLog) if (entry.ip === ip) entry.blocked = false;
    updateDefenseStatus();
    renderAttackLog();
  } else if (act === 'whitelist') {
    // Persist the IP as a user-managed false-positive — detector clears its
    // current suspicion + future packets are ignored across restarts.
    const host = ipToHostCache.get(ip) || null;
    const res = await api.userWhitelistAdd(ip, host);
    if (res?.ok) {
      // Mark every matching entry as whitelisted (history stays visible)
      for (const entry of attackLog) {
        if (entry.ip === ip) {
          entry.whitelisted = true;
          entry.whitelistedAt = Date.now();
          entry.ended = true;
          entry.endedAt = entry.endedAt || Date.now();
          entry.blocked = false;
        }
      }
      attackingIPs.delete(ip);
      confirmedIPs.delete(ip);
      blockedIPs.delete(ip);
      attackById.delete(ip);
      const brand = host ? findBrand(host) : null;
      const label = brand?.title || host || ip;
      statusBar.textContent = `✓ ${t('log_whitelisted_toast')} ${label} (${ip}) — ${t('log_whitelisted_hint')}`;
      statusBar.style.color = '#4cffaa';
      updateDefenseStatus();
      renderAttackLog();
    }
  }
});

// View button → switch to Attack Log tab
document.getElementById('btnViewLog').addEventListener('click', () => {
  switchTab('attacks');
});
logFilterSel.addEventListener('change', () => { logFilter = logFilterSel.value; renderAttackLog(); });

document.getElementById('btnClearEnded').addEventListener('click', () => {
  for (let i = attackLog.length - 1; i >= 0; i--) {
    if (attackLog[i].ended) attackLog.splice(i, 1);
  }
  attackLogDirty = true;
  updateDefenseStatus();
  renderAttackLog();
});

document.getElementById('btnUnblockAll').addEventListener('click', async () => {
  await api.unblockAll();
  blockedIPs.clear();
  for (const entry of attackLog) entry.blocked = false;
  updateDefenseStatus();
  renderAttackLog();
});

let logEntryAutoId = 1;

api.onAttackDetected((e) => {
  attackingIPs.add(e.ip);
  const now = Date.now();
  let entry = attackById.get(e.ip);

  // Reuse an existing entry if:
  //   - it's still active, OR
  //   - it ended within ATTACK_REUSE_WINDOW_MS (treat re-detection as same incident)
  const reusable = entry && (!entry.ended || (now - (entry.endedAt || now) < ATTACK_REUSE_WINDOW_MS));

  if (reusable) {
    if (entry.ended) {
      entry.ended = false;
      entry.endedAt = undefined;
      entry.reopens = (entry.reopens || 0) + 1;
    }
    entry.type = e.type;
    entry.severity = Math.max(entry.severity, e.severity || 1);
    entry.pps = Math.max(entry.pps, e.pps || 0);
  } else {
    entry = {
      id: logEntryAutoId++,
      ip: e.ip,
      type: e.type,
      severity: e.severity || 1,
      pps: e.pps || 0,
      since: now,
      ended: false,
      confirmed: false,
      blocked: blockedIPs.has(e.ip),
      reopens: 0,
    };
    attackLog.push(entry);
    attackById.set(e.ip, entry);
    // Trim oldest ended entries if over cap
    if (attackLog.length > ATTACK_LOG_MAX) {
      for (let i = 0; i < attackLog.length && attackLog.length > ATTACK_LOG_MAX; i++) {
        if (attackLog[i].ended) { attackLog.splice(i, 1); i--; }
      }
      // Still over? Hard-trim from oldest
      while (attackLog.length > ATTACK_LOG_MAX) attackLog.shift();
    }
  }
  attackLogDirty = true;
  updateDefenseStatus();
});

api.onAttackConfirmed((e) => {
  confirmedIPs.add(e.ip);
  const entry = attackById.get(e.ip);
  if (entry) {
    entry.confirmed = true;
    entry.confirmedAt = Date.now();
    attackLogDirty = true;
  }
  // Sustained attack -> character holds 'block' as base state
  if (defenseMode !== 'off' && character) character.setSustainedBlock(true);
});

api.onAttackEnded((e) => {
  attackingIPs.delete(e.ip);
  confirmedIPs.delete(e.ip);
  const entry = attackById.get(e.ip);
  if (entry && !entry.ended) {
    entry.ended = true;
    entry.endedAt = Date.now();
    // Keep in attackById for ATTACK_REUSE_WINDOW_MS so re-detection reuses entry
    attackLogDirty = true;
  }
  updateDefenseStatus();
  if (confirmedIPs.size === 0 && character) character.setSustainedBlock(false);
});

// Periodic cleanup of attackById entries past reuse window (every 60s)
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of attackById) {
    if (entry.ended && (now - (entry.endedAt || 0) > ATTACK_REUSE_WINDOW_MS)) {
      attackById.delete(ip);
    }
  }
}, 60000);

api.onAttackStats((e) => {
  const live = new Set(e.attackingIPs);
  for (const ip of attackingIPs) if (!live.has(ip)) attackingIPs.delete(ip);
  for (const ip of live) attackingIPs.add(ip);
  updateDefenseStatus();
});

api.onIPBlocked((e) => {
  blockedIPs.add(e.ip);
  const entry = attackById.get(e.ip) || attackLog.find(x => x.ip === e.ip && !x.ended);
  if (entry) {
    entry.blocked = true;
    entry.blockedAt = Date.now();
    attackLogDirty = true;
  }
  updateDefenseStatus();
});

api.onIPUnblocked((e) => {
  blockedIPs.delete(e.ip);
  // Mark any log entries for this IP as unblocked
  for (const entry of attackLog) {
    if (entry.ip === e.ip && entry.blocked) {
      entry.blocked = false;
      attackLogDirty = true;
    }
  }
  updateDefenseStatus();
});

// ── Window controls ───────────────────────────────────────────────────────────
document.getElementById('btnMin').addEventListener('click', () => api.windowMinimize());
document.getElementById('btnMax').addEventListener('click', () => api.windowMaximize());
document.getElementById('btnClose').addEventListener('click', () => api.windowClose());

// ── Devices tab rendering ────────────────────────────────────────────────────
const devicesListEl = document.getElementById('devicesList');
const devicesCountEl = document.getElementById('devicesCount');
const devicesBadgeEl = document.getElementById('devicesBadge');

function renderDevicesTab() {
  devicesDirty = false;
  // Update badge with non-local device count
  const all = Array.from(devices.values());
  const remoteCount = all.filter(d => !d.isLocal).length;
  if (devicesCountEl) devicesCountEl.textContent = `(${all.length})`;
  if (devicesBadgeEl) {
    if (remoteCount > 0) {
      devicesBadgeEl.textContent = String(remoteCount);
      devicesBadgeEl.classList.add('show');
    } else {
      devicesBadgeEl.classList.remove('show');
    }
  }

  if (activeTab !== 'devices') return;   // skip DOM work when not visible

  devicesListEl.innerHTML = '';
  if (all.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'dev-empty';
    empty.textContent = t('dev_empty');
    devicesListEl.appendChild(empty);
    return;
  }

  // Header row
  const header = document.createElement('div');
  header.className = 'device-row header';
  header.innerHTML = `
    <span></span>
    <span>${t('dev_col_mac')}</span>
    <span>${t('dev_col_ip')}</span>
    <span>${t('dev_col_vendor')}</span>
    <span>${t('dev_col_hostname')}</span>
    <span>${t('dev_col_packets')}</span>
    <span>${t('dev_col_last')}</span>`;
  devicesListEl.appendChild(header);

  // Sort: local first, then by last-seen desc
  const sorted = all.sort((a, b) => {
    if (a.isLocal !== b.isLocal) return a.isLocal ? -1 : 1;
    return b.lastSeen - a.lastSeen;
  });

  const now = Date.now();
  const frag = document.createDocumentFragment();
  for (const d of sorted.slice(0, 200)) {
    const row = document.createElement('div');
    row.className = 'device-row' + (d.isLocal ? ' local' : '');
    const since = Math.floor((now - d.lastSeen) / 1000);
    const sinceText = since < 60 ? `${since}s` : since < 3600 ? `${Math.floor(since/60)}m` : `${Math.floor(since/3600)}h`;
    const vendorText = d.vendor || (d.isLocal ? t('dev_local') : t('dev_unknown'));
    row.innerHTML = `
      <span class="dev-icon">${d.isLocal ? '🏠' : d.icon}</span>
      <span class="dev-mac">${escapeHtml(d.mac)}</span>
      <span class="dev-ip">${escapeHtml(d.ip || '—')}</span>
      <span class="dev-vendor">${escapeHtml(vendorText)}</span>
      <span class="dev-host">${escapeHtml(d.hostname || '')}</span>
      <span class="dev-pkts">${d.packets}</span>
      <span class="dev-time">${sinceText}</span>`;
    frag.appendChild(row);
  }
  devicesListEl.appendChild(frag);
}

// ── Stats tab rendering ──────────────────────────────────────────────────────
const statsContentEl = document.getElementById('statsContent');

function formatBytesShort(b) {
  if (b < 1024) return `${b}B`;
  if (b < 1024*1024) return `${(b/1024).toFixed(1)}K`;
  if (b < 1024*1024*1024) return `${(b/1024/1024).toFixed(1)}M`;
  return `${(b/1024/1024/1024).toFixed(2)}G`;
}

let cachedLogInfo = null;
let cachedLogPolicy = null;
let cachedLogDir = null;
let cachedDetectorStats = null;
let cachedAppVersion = null;

async function refreshLogPolicyCache() {
  try {
    cachedLogPolicy = await window.wirechar.getSetting('logPolicy') || 'attacks';
    cachedLogInfo = await window.wirechar.logInfo();
    if (!cachedLogDir) cachedLogDir = await window.wirechar.logDir();
    if (window.wirechar.detectorStats) cachedDetectorStats = await window.wirechar.detectorStats();
    if (!cachedAppVersion && window.wirechar.appVersion) cachedAppVersion = await window.wirechar.appVersion();
  } catch (_) {}
}
refreshLogPolicyCache();
if (window.wirechar?.onLogPolicyChanged) {
  window.wirechar.onLogPolicyChanged((p) => { cachedLogPolicy = p; });
}

function renderStatsTab() {
  if (activeTab !== 'stats') return;
  if (sessionStats.totalPackets === 0) {
    statsContentEl.innerHTML = `<div class="stats-empty">${t('stats_no_data')}</div>`;
    return;
  }
  // Refresh log info each render (cheap, IPC)
  refreshLogPolicyCache();

  // Top talkers (by bytes)
  const topHosts = Array.from(sessionStats.byHost.entries())
    .sort((a, b) => b[1].bytes - a[1].bytes)
    .slice(0, 10);
  const maxHostBytes = topHosts[0]?.[1].bytes || 1;

  // Protocols (by bytes)
  const protocols = Array.from(sessionStats.byProtocol.entries())
    .sort((a, b) => b[1].bytes - a[1].bytes);
  const maxProtoBytes = protocols[0]?.[1].bytes || 1;

  // Activity tags
  const tags = Array.from(sessionStats.byTag.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const maxTagCount = tags[0]?.[1] || 1;

  // Session summary
  const dur = sessionStats.startTime ? Math.floor((Date.now() - sessionStats.startTime) / 1000) : 0;
  const durText = dur < 60 ? `${dur}s` : dur < 3600 ? `${Math.floor(dur/60)}m ${dur%60}s` : `${Math.floor(dur/3600)}h ${Math.floor((dur%3600)/60)}m`;

  statsContentEl.innerHTML = `
    <div class="stats-grid">
      <div class="stats-card">
        <h3>${t('stats_summary')}</h3>
        <div class="stats-summary">
          <span class="key">${t('stats_session_pkts')}</span><span class="val">${sessionStats.totalPackets.toLocaleString()}</span>
          <span class="key">${t('stats_session_bytes')}</span><span class="val">${formatBytesShort(sessionStats.totalBytes)}</span>
          <span class="key">${t('stats_session_duration')}</span><span class="val">${durText}</span>
          <span class="key">${t('stats_session_hosts')}</span><span class="val">${sessionStats.uniqueHosts.size}</span>
          <span class="key">${t('stats_log_policy')}</span><span class="val">${escapeHtml(t('stats_log_policy_' + (cachedLogPolicy || 'attacks')))}</span>
          <span class="key">${t('stats_log_written')}</span><span class="val">${(cachedLogInfo?.packets || 0).toLocaleString()}</span>
          <span class="key">${t('stats_log_skipped')}</span><span class="val" style="color:var(--text-dim)">${(cachedLogInfo?.skipped || 0).toLocaleString()}</span>
        </div>
        ${cachedLogDir ? `
          <div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border);font-size:10px;color:var(--text-dim);display:flex;align-items:center;gap:8px">
            <span style="flex-shrink:0">${t('stats_log_dir')}:</span>
            <code style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text);font-family:'Consolas',monospace;font-size:10px" title="${escapeHtml(cachedLogDir)}">${escapeHtml(cachedLogDir)}</code>
            <button onclick="window.wirechar.logOpenDir()" style="background:var(--panel);color:var(--text);border:1px solid var(--border);padding:2px 8px;font-family:var(--font);font-size:9px;border-radius:2px;cursor:pointer">${t('stats_log_open')}</button>
          </div>
        ` : ''}
      </div>

      <div class="stats-card">
        <h3>${t('stats_protocols')}</h3>
        ${protocols.map(([proto, v]) => `
          <div class="stats-bar-row">
            <span class="label">${escapeHtml(proto)}</span>
            <span class="value">${formatBytesShort(v.bytes)}</span>
            <div class="stats-bar"><div class="stats-bar-fill" style="width:${(v.bytes/maxProtoBytes*100).toFixed(1)}%"></div></div>
          </div>`).join('')}
      </div>

      <div class="stats-card" style="grid-column: 1 / -1">
        <h3>${t('stats_top_talkers')}</h3>
        ${topHosts.map(([host, v]) => `
          <div class="stats-bar-row">
            <span class="label" title="${escapeHtml(host)}">${escapeHtml(host)}</span>
            <span class="value">${formatBytesShort(v.bytes)}</span>
            <div class="stats-bar"><div class="stats-bar-fill" style="width:${(v.bytes/maxHostBytes*100).toFixed(1)}%"></div></div>
          </div>`).join('') || `<div class="stats-empty">${t('stats_no_data')}</div>`}
      </div>

      <div class="stats-card" style="grid-column: 1 / -1">
        <h3>${t('stats_classifiers')}</h3>
        ${tags.map(([tag, count]) => `
          <div class="stats-bar-row">
            <span class="label">${escapeHtml(tag)}</span>
            <span class="value">${count}</span>
            <div class="stats-bar"><div class="stats-bar-fill" style="width:${(count/maxTagCount*100).toFixed(1)}%"></div></div>
          </div>`).join('') || `<div class="stats-empty">${t('stats_no_data')}</div>`}
      </div>

      ${cachedDetectorStats ? `
        <div class="stats-card" style="grid-column: 1 / -1">
          <h3>${t('stats_diagnostics')}</h3>
          <div class="stats-summary">
            <span class="key">${t('stats_app_version')}</span><span class="val">v${escapeHtml(cachedAppVersion || '?')}</span>
            <span class="key">${t('stats_trusted_ips')}</span><span class="val">${cachedDetectorStats.trustedIPs.toLocaleString()}</span>
            <span class="key">${t('stats_tracking_ips')}</span><span class="val">${cachedDetectorStats.byIP.toLocaleString()}</span>
            <span class="key">${t('stats_active_suspicions')}</span><span class="val" style="color:${cachedDetectorStats.suspicious.length>0?'#ff8866':'var(--text)'}">${cachedDetectorStats.suspicious.length}</span>
            <span class="key">${t('stats_user_whitelist')}</span><span class="val">${cachedDetectorStats.userWhitelist}</span>
            <span class="key">${t('stats_iphost_cache')}</span><span class="val">${cachedDetectorStats.ipHostCache.toLocaleString()}</span>
          </div>
          ${cachedDetectorStats.suspicious.length > 0 ? `
            <div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border);font-size:10px;color:var(--text-dim)">
              ${cachedDetectorStats.suspicious.map(s => `
                <div style="display:flex;gap:8px;padding:2px 0">
                  <code style="color:var(--text);font-family:'Consolas',monospace;min-width:130px">${escapeHtml(s.ip)}</code>
                  <span>${escapeHtml(s.type)}</span>
                  <span>${(s.sinceMs/1000).toFixed(1)}s</span>
                  <span style="margin-left:auto">${s.confirmed?'CONFIRMED':(s.announced?'announced':'grace')}</span>
                </div>`).join('')}
            </div>` : ''}
        </div>` : ''}
    </div>`;
}

// ── Tab switching ────────────────────────────────────────────────────────────
const tabBar = document.getElementById('tabBar');
const tabPanes = document.querySelectorAll('.tab-pane');

function switchTab(tabName) {
  if (tabName === activeTab) return;
  activeTab = tabName;
  tabBar.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
  tabPanes.forEach(p => p.classList.toggle('active', p.dataset.tab === tabName));
  // Render content if just opened
  if (tabName === 'devices')  renderDevicesTab();
  if (tabName === 'stats')    renderStatsTab();
  if (tabName === 'attacks')  renderAttackLog();
  if (tabName === 'live')     listDirty = true;
}

tabBar.addEventListener('click', (e) => {
  const btn = e.target.closest('.tab');
  if (!btn) return;
  switchTab(btn.dataset.tab);
});

// ── Resizer for inspector panel ────────────────────────────────────────────────
const resizer = document.getElementById('resizer');
const inspector = document.getElementById('inspector');
let resizing = false;
let resizeStartY = 0;
let resizeStartH = 0;

resizer.addEventListener('mousedown', (e) => {
  resizing = true;
  resizeStartY = e.clientY;
  resizeStartH = inspector.offsetHeight;
  document.body.style.cursor = 'ns-resize';
  e.preventDefault();
});
window.addEventListener('mousemove', (e) => {
  if (!resizing) return;
  const delta = resizeStartY - e.clientY;
  const newH = Math.max(140, Math.min(window.innerHeight - 200, resizeStartH + delta));
  inspector.style.height = `${newH}px`;
});
window.addEventListener('mouseup', () => {
  if (resizing) {
    resizing = false;
    document.body.style.cursor = '';
    resize();
    rebuildGrid();
    if (character) {
      character.x = canvas.width * 0.5;
      character.y = canvas.height * 0.5;
    }
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────
function init() {
  requestAnimationFrame(() => {
    resize();
    if (canvas.width === 0 || canvas.height === 0) {
      setTimeout(() => { resize(); startAfterResize(); }, 50);
    } else {
      startAfterResize();
    }
  });
}

function startAfterResize() {
  character = new Character(canvas.width * 0.5, canvas.height * 0.5);
  particles = new ParticleSystem();
  rebuildGrid();
  initLanguage();
  populateDevices().then(restoreDefenseMode);
  loadVersion();
  requestAnimationFrame((tt) => { lastTime = tt; loop(tt); });
}

async function loadVersion() {
  if (!window.wirechar?.appVersion) return;
  try {
    const v = await window.wirechar.appVersion();
    const el = document.getElementById('versionTag');
    if (el && v) el.textContent = 'v' + v;
  } catch (_) {}
}

// Restore previous defense mode (always-on use case) — runs after device list
// is populated so we have a selectedDevice to auto-capture on.
async function restoreDefenseMode() {
  if (!window.wirechar?.getSetting) return;
  try {
    const saved = await window.wirechar.getSetting('defenseMode');
    if (saved && saved !== 'off' && (saved === 'detect' || saved === 'block')) {
      // Apply without re-persisting (already saved)
      await applyDefenseMode(saved, /*persist*/ false);
      const old = statusBar.textContent;
      statusBar.textContent = t('defense_resumed') + (old.includes(t('defense_auto_start')) ? '' : '');
    }
  } catch (_) {}
}

// ── Language selector ────────────────────────────────────────────────────────
function initLanguage() {
  const langSel = document.getElementById('langSelect');
  langSel.value = getLang();
  langSel.addEventListener('change', () => setLang(langSel.value));

  applyStaticTranslations();

  // When language changes, re-translate dynamic UI bits
  onLangChange(() => {
    applyStaticTranslations();

    // Re-render packet list so classifier labels follow new language
    listDirty = true;

    // Re-translate capture button (state-dependent)
    btnCapture.textContent = capturing ? t('capture_stop') : t('capture_start');

    // Re-translate defense status
    updateDefenseStatus();

    // Re-translate the currently visible packet detail (if any)
    if (selectedPacketIdx !== null) {
      const pkt = packets.find(p => p._id === selectedPacketIdx);
      if (pkt) showDetail(pkt);
    } else {
      detailContent.innerHTML = `<div class="detail-placeholder">${t('detail_placeholder')}</div>`;
    }

    // Re-render currently active tab content (labels change with language)
    if (activeTab === 'attacks') renderAttackLog();
    if (activeTab === 'devices') renderDevicesTab();
    if (activeTab === 'stats')   renderStatsTab();
  });
}

window.addEventListener('resize', () => {
  if (character) {
    character.x = canvas.width * 0.5;
    character.y = canvas.height * 0.5;
  }
  rebuildGrid();
});

init();
