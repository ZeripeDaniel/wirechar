/**
 * Background reverse-DNS (PTR) resolver.
 *
 * When we see a public IP we have NO host info for (no SNI, no HTTP Host,
 * no DNS A response observed — typical for Discord voice / WebRTC media),
 * try a PTR lookup. Many cloud providers set helpful PTR records
 * (e.g. `35.213.6.71.bc.googleusercontent.com`, `discord.media`), which
 * gives the brand-matching layer enough to tag the packet.
 *
 * Strategy:
 *   - Rate limited: at most MAX_CONCURRENT in flight
 *   - Negative-cache: failed lookups won't re-attempt for NEG_RETRY_MS
 *   - Skips private / multicast / loopback / link-local — they never help
 *   - Writes results into the IPHostCache so brand badges pick them up
 *     immediately + persisted to disk for next launch
 */
const dns = require('dns').promises;
const { EventEmitter } = require('events');

const MAX_CONCURRENT = 4;
const NEG_RETRY_MS   = 10 * 60 * 1000;   // re-try a failed IP at most every 10 min
const LOOKUP_TIMEOUT = 3000;             // per-lookup hard cap

function isPrivateOrSpecial(ip) {
  if (!ip || typeof ip !== 'string' || ip === '?' || ip === '0.0.0.0') return true;
  if (ip.includes(':')) return true;     // skip IPv6 for now (LL/ULA mostly)
  if (ip.startsWith('127.') || ip.startsWith('169.254.')) return true;
  if (ip.startsWith('10.') || ip.startsWith('192.168.')) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(ip)) return true;
  if (ip.startsWith('224.') || ip.startsWith('239.')) return true;
  if (ip === '255.255.255.255') return true;
  return false;
}

class PTRLookup extends EventEmitter {
  constructor() {
    super();
    this.cache = null;             // IPHostCache instance, injected
    this.pending = new Set();
    this.failed = new Map();        // ip → last-fail timestamp
    this.queue = [];
    this.active = 0;
    this.stats = { resolved: 0, failed: 0, queued: 0 };
  }

  attach(ipHostCache) { this.cache = ipHostCache; }

  /** Request a PTR lookup. No-op if already cached / pending / private. */
  request(ip) {
    if (!this.cache) return;
    if (isPrivateOrSpecial(ip)) return;
    if (this.pending.has(ip)) return;
    if (this.cache.get(ip)) return;
    const last = this.failed.get(ip);
    if (last && (Date.now() - last) < NEG_RETRY_MS) return;
    if (this.active >= MAX_CONCURRENT) {
      if (!this.queue.includes(ip)) {
        this.queue.push(ip);
        this.stats.queued++;
      }
      return;
    }
    this._resolve(ip);
  }

  async _resolve(ip) {
    this.pending.add(ip);
    this.active++;
    try {
      const names = await Promise.race([
        dns.reverse(ip),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), LOOKUP_TIMEOUT)),
      ]);
      if (names && names.length > 0) {
        const name = names[0];
        this.cache.set(ip, name);
        this.stats.resolved++;
        this.emit('resolved', { ip, host: name });
      } else {
        this.failed.set(ip, Date.now());
        this.stats.failed++;
      }
    } catch (_) {
      this.failed.set(ip, Date.now());
      this.stats.failed++;
    } finally {
      this.pending.delete(ip);
      this.active--;
      while (this.queue.length > 0 && this.active < MAX_CONCURRENT) {
        const next = this.queue.shift();
        if (!this.cache.get(next) && !this.pending.has(next)) {
          this._resolve(next);
        }
      }
    }
  }

  getStats() {
    return {
      ...this.stats,
      pending: this.pending.size,
      queueDepth: this.queue.length,
      failedCount: this.failed.size,
    };
  }
}

module.exports = new PTRLookup();
module.exports.isPrivateOrSpecial = isPrivateOrSpecial;
