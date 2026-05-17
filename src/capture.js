/**
 * Packet capture using tshark (bundled with Wireshark).
 * Requires Wireshark/tshark installed + Npcap.
 * Must run as Administrator for raw packet access.
 */
const { EventEmitter } = require('events');
const { spawn, execFile, exec } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { compileQuery, rawLinePrefilter } = require('./search');

const TSHARK_PATHS = [
  'C:\\Program Files\\Wireshark\\tshark.exe',
  'C:\\Program Files (x86)\\Wireshark\\tshark.exe',
];

function findTshark() {
  for (const p of TSHARK_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

class PacketCapture extends EventEmitter {
  constructor() {
    super();
    this.proc = null;
    this.tshark = findTshark();
    this.localIPs = new Set();
    this._collectLocalIPs();
  }

  _collectLocalIPs() {
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
      for (const iface of ifaces[name]) {
        if (!iface.internal) this.localIPs.add(iface.address);
      }
    }
  }

  isAvailable() {
    return this.tshark !== null;
  }

  // Returns a promise resolving to array of { name, description, ip }
  // `ip` is the IPv4 address of the matching OS interface (best-effort match
  // by friendly name), or null when no association can be found.
  getDevices() {
    return new Promise((resolve) => {
      if (!this.tshark) return resolve([]);
      execFile(this.tshark, ['-D'], { timeout: 5000 }, (err, stdout) => {
        if (err) return resolve([]);
        const ifaceIPMap = this._buildInterfaceIPMap();
        const devices = [];
        for (const line of stdout.split('\n')) {
          // Format: "1. \Device\NPF_{GUID} (Description)"
          const m = line.match(/^\d+\.\s+(\S+)\s*\((.+)\)/);
          if (m) {
            const description = m[2].trim();
            const ip = this._matchInterfaceIP(description, ifaceIPMap);
            devices.push({ name: m[1], description, ip });
          }
        }
        resolve(devices);
      });
    });
  }

  // friendlyName → first non-internal IPv4 (e.g. "Wi-Fi" → "192.168.0.165")
  _buildInterfaceIPMap() {
    const map = new Map();
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
      for (const iface of ifaces[name]) {
        if (!iface.internal && iface.family === 'IPv4') {
          if (!map.has(name)) map.set(name, iface.address);
        }
      }
    }
    return map;
  }

  // tshark's -D description is usually the OS friendly name (e.g. "Wi-Fi").
  // Fall back to case-insensitive and partial matches for vendor descriptions.
  _matchInterfaceIP(description, ifaceMap) {
    if (ifaceMap.has(description)) return ifaceMap.get(description);
    const low = description.toLowerCase();
    for (const [key, ip] of ifaceMap) {
      if (key.toLowerCase() === low) return ip;
    }
    for (const [key, ip] of ifaceMap) {
      const k = key.toLowerCase();
      if (low.includes(k) || k.includes(low)) return ip;
    }
    return null;
  }

  start(deviceName, displayFilter) {
    if (!this.tshark) {
      this.emit('error', new Error('tshark not found. Install Wireshark and ensure it is in the default path.'));
      return false;
    }
    if (this.proc) this.stop();
    this.lastDevice = deviceName;
    this.lastFilter = displayFilter || '';

    // pcap files for hex dump on demand. We use tshark's ring-buffer mode so
    // capture NEVER stops on its own — old files roll off as new ones fill.
    //   -b filesize:51200  → 50 MB per file
    //   -b files:6         → keep last 6 files = 300 MB rolling window
    // tshark adds a numeric suffix per file: wirechar-PID_00001_YYYYMMDDHHMMSS.pcapng
    this.pcapBase = path.join(os.tmpdir(), `wirechar-${process.pid}.pcapng`);
    this.pcapPath = this.pcapBase;                 // legacy single-file path
    this._cleanupOldPcapFiles();

    // Reset user-stop flag — auto-restart logic uses this to distinguish
    // intentional stops from process death.
    this._userStopped = false;

    // JSONL session log (one packet per line) — append-only.
    // Rotated by date. Lets the user search/replay after capture stops.
    this._openSessionLog();

    // tshark fields (tab-separated, one line per packet)
    const fields = [
      'frame.number',                            // 0
      'frame.time_epoch',                        // 1
      'ip.src',                                  // 2
      'ip.dst',                                  // 3
      'ip.ttl',                                  // 4
      'ip.proto',                                // 5
      'tcp.srcport',                             // 6
      'tcp.dstport',                             // 7
      'tcp.flags',                               // 8
      'tcp.seq',                                 // 9
      'tcp.ack',                                 // 10
      'tcp.window_size',                         // 11
      'udp.srcport',                             // 12
      'udp.dstport',                             // 13
      'dns.qry.name',                            // 14
      'dns.qry.type',                            // 15
      'dns.a',                                   // 16
      'dns.aaaa',                                // 17
      'dns.cname',                               // 18
      'http.host',                               // 19
      'http.request.method',                     // 20
      'http.request.uri',                        // 21
      'http.response.code',                      // 22
      'http.response.phrase',                    // 23
      'http.user_agent',                         // 24
      'tls.handshake.extensions_server_name',    // 25
      'tls.handshake.version',                   // 26
      'tls.handshake.type',                      // 27
      'eth.src',                                 // 28
      'eth.dst',                                 // 29
      'frame.len',                               // 30
      '_ws.col.Protocol',                        // 31
      '_ws.col.Info',                            // 32
    ];

    const args = [
      '-i', deviceName,
      '-l',             // line-buffered
      '-n',             // no name resolution (we do our own)
      '-T', 'fields',
      '-E', 'header=n',
      '-E', 'separator=\t',
      '-E', 'quote=n',
      '-E', 'occurrence=f', // first value only
    ];
    if (displayFilter && displayFilter.trim()) {
      args.push('-Y', displayFilter.trim());
    }
    // Ringbuffer mode — pcap NEVER fills disk, NEVER stops capture
    args.push('-w', this.pcapBase);
    args.push('-b', 'filesize:51200');   // 50 MB per file
    args.push('-b', 'files:6');          // 6 files = ~300 MB rolling
    args.push('-P');                      // print summary to stdout when -w is used
    for (const f of fields) args.push('-e', f);

    try {
      this.proc = spawn(this.tshark, args, { windowsHide: true });
    } catch (e) {
      this.emit('error', e);
      return false;
    }

    let buf = '';
    this.proc.stdout.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop(); // keep incomplete last line
      for (const line of lines) {
        if (line.trim()) this._parseLine(line);
      }
    });

    this.proc.stderr.on('data', (d) => {
      if (this._userStopped) return;          // shutdown noise, ignore
      const msg = d.toString().trim();
      if (!msg || msg.startsWith('Capturing on')) return;
      const low = msg.toLowerCase();
      // Filter syntax / capture errors -> bubble up
      if (low.includes('error') || low.includes('fail') ||
          low.includes('was unexpected') || low.includes('isn\'t a valid') ||
          low.includes('syntax error') || low.includes('no such')) {
        this.emit('error', new Error(msg));
      }
    });

    this.proc.on('close', (code) => {
      this.proc = null;
      this._closeSessionLog();
      // Non-zero exit IS expected when the user clicked Stop (taskkill /F → 1).
      // Only surface as error when we didn't initiate the shutdown.
      if (code !== 0 && code !== null && !this._userStopped) {
        this.emit('error', new Error(`tshark exited with code ${code}`));
      }
      // Auto-restart if tshark died unexpectedly (not from user clicking Stop)
      if (!this._userStopped && this.lastDevice) {
        this.emit('restarting', { lastCode: code });
        const dev = this.lastDevice;
        const flt = this.lastFilter;
        setTimeout(() => {
          // Only restart if no other start happened in the meantime
          if (!this.proc && !this._userStopped) {
            this.start(dev, flt);
          }
        }, 1000);
      }
    });

    this.emit('started', deviceName);
    return true;
  }

  // ── Session JSONL log ──────────────────────────────────────────────────────
  _openSessionLog() {
    try {
      if (!this.logDir) return;        // logDir is set by main.js after construction
      if (!fs.existsSync(this.logDir)) fs.mkdirSync(this.logDir, { recursive: true });
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      this.sessionLogPath = path.join(this.logDir, `session-${stamp}.jsonl`);
      this.sessionLogStream = fs.createWriteStream(this.sessionLogPath, { flags: 'a' });
      this.sessionLogStream.on('error', (err) => {
        // Don't crash — just disable writes for this session
        this.sessionLogStream = null;
        this.emit('error', new Error('Session log write error: ' + err.message));
      });
      this.sessionLogBytes = 0;
      this.sessionLogPackets = 0;
      this.sessionLogSkipped = 0;
      this._recentBuffer = [];
    } catch (e) {
      this.sessionLogStream = null;
    }
  }

  /**
   * Filter predicate set by main.js. If returns false the packet is skipped
   * from disk write but kept in the recent-context buffer (so an attack can
   * later flush prior packets for forensics).
   */
  setLogFilter(fn) {
    this._logFilter = (typeof fn === 'function') ? fn : null;
  }

  _appendToSessionLog(pkt) {
    // Always update the recent-context circular buffer (200 KB ~ 500 packets)
    if (!this._recentBuffer) this._recentBuffer = [];
    this._recentBuffer.push(pkt);
    if (this._recentBuffer.length > 500) this._recentBuffer.shift();

    if (!this.sessionLogStream) return;
    if (this._logFilter && !this._logFilter(pkt)) {
      this.sessionLogSkipped = (this.sessionLogSkipped || 0) + 1;
      return;
    }
    this._writeToSessionLog(pkt);
  }

  _writeToSessionLog(pkt) {
    if (!this.sessionLogStream) return;
    try {
      const line = JSON.stringify(pkt) + '\n';
      this.sessionLogStream.write(line);
      this.sessionLogBytes += line.length;
      this.sessionLogPackets++;
    } catch (_) {}
  }

  /**
   * Write packets from the recent-context buffer that match `predicate`
   * (typically: src or dst equals an attacking IP) — gives forensic context
   * for the seconds BEFORE an attack was flagged.
   * Tags each context packet with `_context: true` so analysts can spot them.
   */
  flushBufferToLog(predicate) {
    if (!this.sessionLogStream || !this._recentBuffer) return 0;
    const seenFrames = new Set();
    let count = 0;
    for (const pkt of this._recentBuffer) {
      if (!predicate(pkt)) continue;
      if (seenFrames.has(pkt.frame)) continue;
      seenFrames.add(pkt.frame);
      this._writeToSessionLog({ ...pkt, _context: true });
      count++;
    }
    return count;
  }

  _closeSessionLog() {
    if (this.sessionLogStream) {
      try { this.sessionLogStream.end(); } catch (_) {}
      this.sessionLogStream = null;
    }
  }

  /** Returns { path, bytes, packets, skipped } for current session log. */
  getSessionLogInfo() {
    return {
      path: this.sessionLogPath || null,
      bytes: this.sessionLogBytes || 0,
      packets: this.sessionLogPackets || 0,
      skipped: this.sessionLogSkipped || 0,
      active: !!this.sessionLogStream,
    };
  }

  /** Aggregate disk usage of all session logs. Returns { bytes, files, oldest, newest }. */
  getLogDiskUsage() {
    if (!this.logDir || !fs.existsSync(this.logDir)) {
      return { bytes: 0, files: 0, oldest: null, newest: null };
    }
    let bytes = 0, count = 0, oldest = null, newest = null;
    for (const name of fs.readdirSync(this.logDir)) {
      if (!name.endsWith('.jsonl')) continue;
      try {
        const st = fs.statSync(path.join(this.logDir, name));
        bytes += st.size;
        count++;
        if (!oldest || st.mtimeMs < oldest) oldest = st.mtimeMs;
        if (!newest || st.mtimeMs > newest) newest = st.mtimeMs;
      } catch (_) {}
    }
    return { bytes, files: count, oldest, newest };
  }

  /**
   * Delete all session JSONL files. By default keeps the currently active
   * session log so an in-progress capture isn't disrupted.
   * Returns { deleted, bytes, kept } where bytes = total freed.
   */
  clearSessionLogs({ includeCurrent = false } = {}) {
    if (!this.logDir || !fs.existsSync(this.logDir)) {
      return { deleted: 0, bytes: 0, kept: 0 };
    }
    const currentPath = (this.sessionLogStream && this.sessionLogPath) ? this.sessionLogPath : null;
    let deleted = 0, freed = 0, kept = 0;
    for (const name of fs.readdirSync(this.logDir)) {
      if (!name.endsWith('.jsonl')) continue;
      const full = path.join(this.logDir, name);
      if (!includeCurrent && currentPath && full === currentPath) {
        kept++;
        continue;
      }
      try {
        const st = fs.statSync(full);
        fs.unlinkSync(full);
        deleted++;
        freed += st.size;
      } catch (_) { /* file in use or already gone */ }
    }
    return { deleted, bytes: freed, kept };
  }

  /** List all session log files on disk (newest first), with metadata. */
  listSessionLogs() {
    if (!this.logDir || !fs.existsSync(this.logDir)) return [];
    return fs.readdirSync(this.logDir)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => {
        const full = path.join(this.logDir, f);
        const st = fs.statSync(full);
        return { name: f, path: full, bytes: st.size, mtime: st.mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
  }

  /**
   * Read the tail of a JSONL log file and optionally filter by substring.
   * Returns at most `limit` parsed packet objects (newest first).
   * For very large files this reads up to 8MB from the end — enough for
   * tens of thousands of packets but bounded so we don't OOM the renderer.
   */
  async readSessionLog({ file, query, limit = 1000 } = {}) {
    const target = file || this.sessionLogPath;
    if (!target || !fs.existsSync(target)) return [];

    const MAX_READ = 8 * 1024 * 1024;
    const st = fs.statSync(target);
    const start = Math.max(0, st.size - MAX_READ);
    const fd = fs.openSync(target, 'r');
    const buf = Buffer.alloc(st.size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    fs.closeSync(fd);

    // Drop possibly partial first line if we didn't start at file beginning
    let text = buf.toString('utf8');
    if (start > 0) {
      const nl = text.indexOf('\n');
      if (nl >= 0) text = text.slice(nl + 1);
    }
    const lines = text.split('\n');

    // Compile the search query once. Use rawLinePrefilter to skip JSON.parse
    // for plain substring queries (huge speedup on big files).
    const q = (query || '').trim();
    const prefilter = rawLinePrefilter(q);     // null if not eligible
    const matches = q ? compileQuery(q) : null;
    const out = [];
    for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
      const line = lines[i];
      if (!line) continue;
      if (prefilter && !prefilter(line)) continue;
      let pkt;
      try { pkt = JSON.parse(line); } catch (_) { continue; }
      if (matches && !matches(pkt)) continue;
      out.push(pkt);
    }
    return out;
  }

  // Delete previous-run pcap files lingering in TEMP (this PID's files only,
  // plus dead processes' files older than 24h).
  _cleanupOldPcapFiles() {
    try {
      const dir = os.tmpdir();
      const re = /^wirechar-(\d+)(?:_\d+_\d+)?\.pcapng$/;
      const now = Date.now();
      for (const name of fs.readdirSync(dir)) {
        const m = name.match(re);
        if (!m) continue;
        const owner = parseInt(m[1]);
        const full = path.join(dir, name);
        const st = fs.statSync(full);
        // Always delete files belonging to current PID (previous capture)
        if (owner === process.pid) {
          try { fs.unlinkSync(full); } catch (_) {}
          continue;
        }
        // Delete files older than 24h regardless of PID
        if (now - st.mtimeMs > 24 * 3600 * 1000) {
          try { fs.unlinkSync(full); } catch (_) {}
        }
      }
    } catch (_) {}
  }

  // Return all pcap files belonging to the current capture session (ringbuffer files),
  // sorted newest first.
  _listSessionPcaps() {
    try {
      const dir = os.tmpdir();
      const prefix = `wirechar-${process.pid}`;
      const out = [];
      for (const name of fs.readdirSync(dir)) {
        if (!name.startsWith(prefix) || !name.endsWith('.pcapng')) continue;
        const full = path.join(dir, name);
        const st = fs.statSync(full);
        out.push({ path: full, mtime: st.mtimeMs, size: st.size });
      }
      out.sort((a, b) => b.mtime - a.mtime);
      return out;
    } catch (_) { return []; }
  }

  stop() {
    this._userStopped = true;
    this._closeSessionLog();
    if (this.proc) {
      const pid = this.proc.pid;
      // On Windows, tshark spawns dumpcap as a child. SIGTERM/kill() doesn't reach it.
      // Use taskkill with /T (tree) /F (force) to kill the whole process tree.
      if (process.platform === 'win32' && pid) {
        try {
          exec(`taskkill /pid ${pid} /T /F`, () => {});
        } catch (_) {}
      } else {
        try { this.proc.kill(); } catch (_) {}
      }
      this.proc = null;
    }
    // Also clean up any leftover tshark/dumpcap processes (safety net)
    if (process.platform === 'win32') {
      try { exec('taskkill /IM dumpcap.exe /F', () => {}); } catch (_) {}
    }
  }

  /**
   * Fetch hex dump for a specific packet by frame number.
   * With ringbuffer mode there can be multiple pcap files; we try each
   * (newest first) until we find the frame. Frame numbering inside each
   * file restarts at 1, but tshark's global counter (used in our JSONL)
   * continues. We map global → file+local by looking at first-frame numbers.
   *
   * Simpler heuristic that works in practice: try newest file first
   * (most clicked packets are recent), fall through to older files.
   */
  getHexDump(frameNumber) {
    return new Promise((resolve) => {
      if (!this.tshark) {
        return resolve({ hex: null, error: 'tshark not available' });
      }
      const files = this._listSessionPcaps();
      if (files.length === 0) {
        return resolve({ hex: null, error: 'No capture file available' });
      }

      const fn = parseInt(frameNumber) || 0;
      const tryOne = (idx) => {
        if (idx >= files.length) {
          return resolve({ hex: null, error: 'Frame not found in current ringbuffer (rotated out)' });
        }
        const args = [
          '-r', files[idx].path,
          '-Y', `frame.number == ${fn}`,
          '-x', '-n',
        ];
        execFile(this.tshark, args,
          { timeout: 8000, maxBuffer: 4 * 1024 * 1024 },
          (err, stdout) => {
            if (!err && stdout && stdout.trim()) {
              return resolve({ hex: stdout.trim(), error: null });
            }
            tryOne(idx + 1);
          });
      };
      tryOne(0);
    });
  }

  _parseLine(line) {
    const c = line.split('\t');
    const src = c[2] || '';
    const dst = c[3] || '';
    if (!src && !dst) return;

    const tcpSrc = parseInt(c[6]) || 0;
    const tcpDst = parseInt(c[7]) || 0;
    const udpSrc = parseInt(c[12]) || 0;
    const udpDst = parseInt(c[13]) || 0;
    const dnsName = c[14] || '';
    const httpHost = c[19] || '';
    const sni = c[25] || '';
    const frameLen = parseInt(c[30]) || 0;
    const rawProto = (c[31] || '').trim().toUpperCase();

    const isOutgoing = this.localIPs.has(src);
    const direction = isOutgoing ? 'out' : 'in';

    let protocol = rawProto || 'TCP';
    let host = sni || httpHost || dnsName || null;
    const port = isOutgoing ? (tcpDst || udpDst) : (tcpSrc || udpSrc);

    if (protocol.startsWith('TLS') || protocol.startsWith('SSL')) {
      protocol = 'HTTPS';
    } else if (protocol === 'HTTP' || httpHost) {
      protocol = 'HTTP';
    } else if (protocol === 'DNS' || dnsName) {
      protocol = 'DNS';
    } else if (protocol.startsWith('TCP')) {
      protocol = 'TCP';
    } else if (protocol.startsWith('UDP')) {
      protocol = 'UDP';
    } else if (protocol === 'ICMP') {
      protocol = 'ICMP';
    }

    if (host && host.endsWith('.')) host = host.slice(0, -1);

    // Decode TCP flags (hex like 0x012)
    const tcpFlagsRaw = c[8] || '';
    let tcpFlags = null;
    if (tcpFlagsRaw) {
      const v = parseInt(tcpFlagsRaw, 16);
      if (!isNaN(v)) {
        const f = [];
        if (v & 0x01) f.push('FIN');
        if (v & 0x02) f.push('SYN');
        if (v & 0x04) f.push('RST');
        if (v & 0x08) f.push('PSH');
        if (v & 0x10) f.push('ACK');
        if (v & 0x20) f.push('URG');
        tcpFlags = f.join(',') || '-';
      }
    }

    // DNS query type names
    const dnsTypes = { '1':'A', '28':'AAAA', '5':'CNAME', '15':'MX', '16':'TXT', '2':'NS', '12':'PTR', '6':'SOA', '33':'SRV' };
    const dnsQType = c[15] ? (dnsTypes[c[15]] || c[15]) : null;

    // TLS version names
    const tlsVersions = { '0x0301':'TLS 1.0', '0x0302':'TLS 1.1', '0x0303':'TLS 1.2', '0x0304':'TLS 1.3' };
    const tlsVer = c[26] ? (tlsVersions[c[26]] || c[26]) : null;

    const packet = {
      frame: parseInt(c[0]) || 0,
      time: Date.now(),
      src: src || '?',
      dst: dst || '?',
      direction,
      size: frameLen,
      protocol,
      host,
      port,
      // Layer 2
      ethSrc: c[28] || null,
      ethDst: c[29] || null,
      // Layer 3 (IP)
      ipTtl: parseInt(c[4]) || null,
      ipProto: parseInt(c[5]) || null,
      // Layer 4 (TCP)
      tcpSrcPort: tcpSrc || null,
      tcpDstPort: tcpDst || null,
      tcpFlags,
      tcpSeq: c[9] ? parseInt(c[9]) : null,
      tcpAck: c[10] ? parseInt(c[10]) : null,
      tcpWindow: c[11] ? parseInt(c[11]) : null,
      // Layer 4 (UDP)
      udpSrcPort: udpSrc || null,
      udpDstPort: udpDst || null,
      // App layer
      dnsName: dnsName || null,
      dnsQType,
      dnsA: c[16] || null,
      dnsAAAA: c[17] || null,
      dnsCname: c[18] || null,
      httpHost: httpHost || null,
      httpMethod: c[20] || null,
      httpUri: c[21] || null,
      httpStatus: c[22] || null,
      httpPhrase: c[23] || null,
      userAgent: c[24] || null,
      sni: sni || null,
      tlsVersion: tlsVer,
      tlsHsType: c[27] || null,
      info: c[32] || null,
    };

    this._appendToSessionLog(packet);
    this.emit('packet', packet);
  }
}

module.exports = PacketCapture;
