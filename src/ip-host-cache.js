/**
 * Persistent IP → host learning cache.
 *
 * The brand badge system can only label a packet when its host (SNI / HTTP
 * Host / DNS answer) is visible. After a TLS Client Hello, subsequent packets
 * to the same IP carry NO SNI — and across wirechar restarts the in-memory
 * mapping vanishes. This module saves what we learn to disk so the next
 * launch starts knowing 35.213.x.x = discord.com, 1.1.1.1 = cloudflare, etc.
 *
 * Storage: JSON file in userData/ip-host-cache.json (~few hundred KB max).
 * Strategy: LRU, cap at 10k entries, save every 30s if dirty + on quit.
 */
const fs = require('fs');
const path = require('path');

class IPHostCache {
  constructor() {
    this.path = null;
    this.cache = new Map();
    this.dirty = false;
    this.maxEntries = 10000;
    this._timer = null;
  }

  init(filePath) {
    this.path = filePath;
    this._load();
    if (this._timer) clearInterval(this._timer);
    this._timer = setInterval(() => this.save(), 30 * 1000);
  }

  _load() {
    try {
      if (!this.path || !fs.existsSync(this.path)) return;
      const raw = fs.readFileSync(this.path, 'utf8');
      const data = JSON.parse(raw);
      if (Array.isArray(data.entries)) {
        for (const [ip, host] of data.entries) {
          if (typeof ip === 'string' && typeof host === 'string') {
            this.cache.set(ip, host);
          }
        }
      }
      console.log(`[ip-host-cache] loaded ${this.cache.size} entries from ${this.path}`);
    } catch (e) {
      console.warn('[ip-host-cache] load failed:', e.message);
    }
  }

  set(ip, host) {
    if (!ip || !host) return;
    if (ip === '?' || ip === '0.0.0.0') return;
    // Skip multicast/broadcast — meaningless to cache
    if (ip.startsWith('224.') || ip.startsWith('239.') || ip === '255.255.255.255') return;
    // Trim trailing dot from DNS names
    if (host.endsWith('.')) host = host.slice(0, -1);
    const prev = this.cache.get(ip);
    if (prev === host) return;                  // no change
    if (this.cache.has(ip)) this.cache.delete(ip);   // LRU touch (re-insert at tail)
    this.cache.set(ip, host);
    if (this.cache.size > this.maxEntries) {
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest);
    }
    this.dirty = true;
  }

  setBatch(pairs) {
    if (!Array.isArray(pairs)) return 0;
    let n = 0;
    for (const p of pairs) {
      if (Array.isArray(p) && p.length === 2) { this.set(p[0], p[1]); n++; }
    }
    return n;
  }

  get(ip) {
    return this.cache.get(ip);
  }

  all() {
    return Array.from(this.cache.entries());
  }

  size() {
    return this.cache.size;
  }

  clear() {
    if (this.cache.size === 0) return;
    this.cache.clear();
    this.dirty = true;
    this.save();
  }

  /** Remove a single IP entry from the cache. Returns true if it existed. */
  unset(ip) {
    if (!ip || !this.cache.has(ip)) return false;
    this.cache.delete(ip);
    this.dirty = true;
    return true;
  }

  save() {
    if (!this.dirty || !this.path) return;
    try {
      const payload = JSON.stringify({
        savedAt: new Date().toISOString(),
        entries: Array.from(this.cache.entries()),
      });
      // Atomic write: write to .tmp then rename
      const tmp = this.path + '.tmp';
      fs.writeFileSync(tmp, payload);
      fs.renameSync(tmp, this.path);
      this.dirty = false;
    } catch (e) {
      console.warn('[ip-host-cache] save failed:', e.message);
    }
  }

  destroy() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    this.save();
  }
}

module.exports = new IPHostCache();
