/**
 * Attack detector — sliding-window stats per source IP.
 * Detects flood / SYN flood / port scan / ICMP flood / global DDoS.
 * Sustained attacks (> confirmAfterSec) emit 'attack-confirmed' for fail2ban hook.
 */
const { EventEmitter } = require('events');
const trusted = require('./trusted');

class AttackDetector extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = Object.assign({
      windowSec: 5,             // sliding window length (sec)
      ppsThreshold: 300,        // per-IP packets/sec → flood (raised from 80)
      synThreshold: 60,         // SYN-only packets/sec → SYN flood
      portsThreshold: 20,       // unique dst ports in window → port scan
      icmpThreshold: 80,        // ICMP/sec → ICMP flood
      ddosTotalPps: 1500,       // global inbound pps → DDoS
      confirmAfterSec: 60,      // sustained X sec → confirmed (fail2ban trigger)
      cooldownSec: 30,          // keep entry flagged for this long after threshold drops
      gracePeriodSec: 8,        // wait this long over threshold before emitting attack-detected
      whitelist: new Set(),     // IPs never flagged
    }, config);

    this.byIP = new Map();           // ip → { timestamps[], syn[], icmp[], ports:Map }
    this.totalPackets = [];          // [timestamp]
    this.suspicious = new Map();     // ip → { since, type, severity, confirmed }
    this.ipToHost = new Map();       // ip → host (learned at runtime from SNI/DNS/Host)
    this.trustedIPs = new Set();     // ip cache — known to belong to a trusted provider
    this.untrustedIPs = new Set();   // negative cache to avoid re-checking patterns/CIDRs
    this.tickInterval = setInterval(() => this._tick(), 1000);
  }

  /**
   * Learn IP→host mapping from any direction packet (TLS Client Hello goes OUT,
   * but it carries the SNI that identifies the remote server). Must be called
   * for every packet — including outgoing — so we have host info ready when
   * the trusted server bursts data back to us.
   */
  _learn(pkt) {
    const remoteIP = pkt.direction === 'in' ? pkt.src : pkt.dst;
    if (!remoteIP || remoteIP === '?') return;
    const host = pkt.sni || pkt.httpHost || pkt.host || pkt.dnsName;
    if (host) {
      this.ipToHost.set(remoteIP, host);
      if (trusted.isTrustedHost(host)) this.trustedIPs.add(remoteIP);
    }
  }

  /** Should this inbound source IP be skipped (trusted big-service provider)? */
  _isTrustedRemote(ip) {
    if (this.trustedIPs.has(ip)) return true;
    const cachedHost = this.ipToHost.get(ip);
    if (cachedHost && trusted.isTrustedHost(cachedHost)) {
      this.trustedIPs.add(ip);
      return true;
    }
    if (trusted.isTrustedIP(ip)) {     // static CIDR fallback
      this.trustedIPs.add(ip);
      return true;
    }
    return false;
  }

  destroy() {
    if (this.tickInterval) clearInterval(this.tickInterval);
    this.byIP.clear();
    this.suspicious.clear();
    this.ipToHost.clear();
    this.trustedIPs.clear();
    this.untrustedIPs.clear();
    this.totalPackets = [];
  }

  /**
   * Add an IP to the runtime whitelist AND immediately clear any active
   * suspicion / tracking state for it — fires `attack-ended` if it was
   * currently flagged so the UI mirrors the change.
   */
  whitelist(ip) {
    if (!ip) return false;
    this.config.whitelist.add(ip);
    this.byIP.delete(ip);
    this.trustedIPs.add(ip);
    if (this.suspicious.has(ip)) {
      this.suspicious.delete(ip);
      this.emit('attack-ended', { ip, reason: 'whitelisted' });
    }
    return true;
  }

  /** Remove an IP from the whitelist. */
  unwhitelist(ip) {
    if (!ip) return false;
    this.config.whitelist.delete(ip);
    this.trustedIPs.delete(ip);
    return true;
  }

  /**
   * Tell the detector about an IP↔host binding learned out-of-band — e.g.
   * a PTR record resolved later, a manual brand-tag in the UI, or the
   * shared ipHostCache. If the host pattern matches a trusted provider
   * we immediately clear any active suspicion + byIP state for this IP.
   */
  learnHost(ip, host) {
    if (!ip || !host) return;
    this.ipToHost.set(ip, host);
    if (trusted.isTrustedHost(host)) {
      this.trustedIPs.add(ip);
      // Drop accumulated stats so we don't post-hoc-flag a now-trusted IP
      this.byIP.delete(ip);
      if (this.suspicious.has(ip)) {
        this.suspicious.delete(ip);
        this.emit('attack-ended', { ip, reason: 'host-learned-trusted' });
      }
    }
  }

  // Call for every packet (both directions). We always learn host info; we only
  // score inbound packets for attack detection.
  process(pkt) {
    this._learn(pkt);                    // learn from any direction
    if (pkt.direction !== 'in') return;

    const ip = pkt.src;
    if (!ip || ip === '?' || this.config.whitelist.has(ip)) return;

    // Skip multicast/broadcast noise
    if (ip.startsWith('224.') || ip.startsWith('239.') || ip === '255.255.255.255') return;

    // Skip well-known service providers (Anthropic, OpenAI, Google, Cloudflare,
    // AWS, Azure, Naver, Kakao, etc.). They routinely burst hundreds of pps
    // during normal use; flagging them would be 100% false-positive.
    if (this._isTrustedRemote(ip)) return;

    const now = Date.now();
    let s = this.byIP.get(ip);
    if (!s) {
      s = { timestamps: [], syn: [], icmp: [], ports: new Map(), firstSeen: now };
      this.byIP.set(ip, s);
    }
    s.timestamps.push(now);

    if (pkt.tcpFlags && pkt.tcpFlags.includes('SYN') && !pkt.tcpFlags.includes('ACK')) {
      s.syn.push(now);
    }
    if (pkt.tcpDstPort) s.ports.set(pkt.tcpDstPort, now);
    if (pkt.protocol === 'ICMP') s.icmp.push(now);

    this.totalPackets.push(now);
  }

  // Quick check used by renderer to colour particles
  isAttacking(ip) {
    return this.suspicious.has(ip);
  }

  isConfirmed(ip) {
    const s = this.suspicious.get(ip);
    return !!(s && s.confirmed);
  }

  getStats() {
    const out = [];
    for (const [ip, s] of this.suspicious) {
      out.push({
        ip,
        type: s.type,
        severity: s.severity,
        duration: Date.now() - s.since,
        confirmed: !!s.confirmed,
      });
    }
    return out;
  }

  _tick() {
    const now = Date.now();
    const winMs = this.config.windowSec * 1000;

    // Trim global
    this.totalPackets = this.totalPackets.filter(t => now - t < winMs);
    const totalPps = this.totalPackets.length / this.config.windowSec;

    // Per-IP analysis
    for (const [ip, s] of this.byIP) {
      // Re-check trust: host info may have been learned (PTR, manual tag,
      // late DNS) since this IP first entered byIP. If so, drop it silently.
      if (this._isTrustedRemote(ip)) {
        this.byIP.delete(ip);
        if (this.suspicious.has(ip)) {
          const wasAnnounced = this.suspicious.get(ip).announced;
          this.suspicious.delete(ip);
          if (wasAnnounced) this.emit('attack-ended', { ip, reason: 'became-trusted' });
        }
        continue;
      }
      s.timestamps = s.timestamps.filter(t => now - t < winMs);
      s.syn = s.syn.filter(t => now - t < winMs);
      s.icmp = s.icmp.filter(t => now - t < winMs);
      for (const [port, t] of s.ports) {
        if (now - t > winMs) s.ports.delete(port);
      }

      if (s.timestamps.length === 0) {
        this.byIP.delete(ip);
        if (this.suspicious.has(ip)) {
          this.suspicious.delete(ip);
          this.emit('attack-ended', { ip });
        }
        continue;
      }

      const pps = s.timestamps.length / this.config.windowSec;
      const synPps = s.syn.length / this.config.windowSec;
      const portCount = s.ports.size;
      const icmpPps = s.icmp.length / this.config.windowSec;

      let type = null, severity = 0;
      if (synPps >= this.config.synThreshold) {
        type = 'syn_flood'; severity = synPps / this.config.synThreshold;
      } else if (portCount >= this.config.portsThreshold) {
        type = 'port_scan'; severity = portCount / this.config.portsThreshold;
      } else if (icmpPps >= this.config.icmpThreshold) {
        type = 'icmp_flood'; severity = icmpPps / this.config.icmpThreshold;
      } else if (pps >= this.config.ppsThreshold) {
        type = 'flood'; severity = pps / this.config.ppsThreshold;
      }

      if (type) {
        let susp = this.suspicious.get(ip);
        if (!susp) {
          // Start watching but DON'T emit immediately. Wait gracePeriodSec
          // so PTR/SNI/DNS observation has a chance to mark this IP as a
          // legitimate big-traffic provider (Discord voice, streaming, etc.).
          susp = { since: now, type, severity, confirmed: false, announced: false };
          this.suspicious.set(ip, susp);
        } else {
          susp.cooldownStart = null;
          susp.type = type; susp.severity = severity;
          const duration = now - susp.since;
          if (!susp.announced && duration >= this.config.gracePeriodSec * 1000) {
            susp.announced = true;
            this.emit('attack-detected', { ip, type, severity, pps });
          }
          if (susp.announced && !susp.confirmed && duration >= this.config.confirmAfterSec * 1000) {
            susp.confirmed = true;
            this.emit('attack-confirmed', { ip, type, duration, pps });
          }
        }
      } else if (this.suspicious.has(ip)) {
        // Grace period: keep marked for `cooldownSec` after threshold drops.
        // This prevents flapping when traffic hovers right at the threshold.
        const susp = this.suspicious.get(ip);
        if (!susp.cooldownStart) susp.cooldownStart = now;
        if (now - susp.cooldownStart > this.config.cooldownSec * 1000) {
          this.suspicious.delete(ip);
          this.emit('attack-ended', { ip });
        }
      }
    }

    this.emit('stats', {
      totalPps,
      ddos: totalPps >= this.config.ddosTotalPps,
      attackingIPs: Array.from(this.suspicious.keys()),
    });
  }
}

module.exports = AttackDetector;
