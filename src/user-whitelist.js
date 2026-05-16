/**
 * Per-user persistent whitelist of IPs that should never be treated as
 * attackers, no matter how much traffic they send.
 *
 * Separate from `src/trusted.js` (built-in well-known providers — code-level)
 * because this list is owned by the user: they add IPs from the Attack Log
 * "Whitelist" button when something legitimate gets mis-flagged
 * (e.g. Discord voice spike during a stream).
 *
 * Storage: <userData>/user-whitelist.json
 *   { entries: [ { ip, host, addedAt }, ... ] }
 */
const fs = require('fs');
const path = require('path');

class UserWhitelist {
  constructor() {
    this.path = null;
    this.ips = new Map();   // ip → { host, addedAt }
  }

  init(filePath) {
    this.path = filePath;
    this._load();
  }

  _load() {
    try {
      if (!this.path || !fs.existsSync(this.path)) return;
      const data = JSON.parse(fs.readFileSync(this.path, 'utf8'));
      if (Array.isArray(data.entries)) {
        for (const e of data.entries) {
          if (e && typeof e.ip === 'string') {
            this.ips.set(e.ip, {
              host:    e.host    || null,
              addedAt: e.addedAt || null,
            });
          }
        }
      }
      console.log(`[user-whitelist] loaded ${this.ips.size} entries`);
    } catch (e) {
      console.warn('[user-whitelist] load failed:', e.message);
    }
  }

  _save() {
    if (!this.path) return;
    try {
      const entries = Array.from(this.ips.entries()).map(([ip, info]) => ({
        ip, host: info.host, addedAt: info.addedAt,
      }));
      const tmp = this.path + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify({ entries }, null, 2));
      fs.renameSync(tmp, this.path);
    } catch (e) {
      console.warn('[user-whitelist] save failed:', e.message);
    }
  }

  has(ip) { return this.ips.has(ip); }
  size() { return this.ips.size; }

  add(ip, host) {
    if (!ip) return false;
    const existing = this.ips.get(ip);
    if (existing && existing.host === host) return false;
    this.ips.set(ip, {
      host: host || (existing && existing.host) || null,
      addedAt: existing?.addedAt || Date.now(),
    });
    this._save();
    return true;
  }

  remove(ip) {
    if (!this.ips.delete(ip)) return false;
    this._save();
    return true;
  }

  list() {
    return Array.from(this.ips.entries()).map(([ip, info]) => ({
      ip, host: info.host, addedAt: info.addedAt,
    }));
  }

  clear() {
    if (this.ips.size === 0) return;
    this.ips.clear();
    this._save();
  }
}

module.exports = new UserWhitelist();
