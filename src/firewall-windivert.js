/**
 * WinDivert-backed inline IP blocking. Spawns the bundled wirechar-divert.exe
 * helper process and talks to it over stdio.
 *
 * vs. firewall.js (netsh):
 *   - Block latency: ~5 sec       →  <5 ms
 *   - Rule limit:    ~few hundred →  effectively unlimited (hash set)
 *   - Filtering layer:  WFP / 보통 →  WFP callout (kernel)
 *   - Volumetric DDoS: still NOT mitigated (bandwidth is upstream)
 *
 * The helper is only available in the NSIS-installer build. For portable
 * builds (or when not running as admin), the netsh backend is used instead.
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { EventEmitter } = require('events');

class WinDivertFirewall extends EventEmitter {
  constructor() {
    super();
    this.proc = null;
    this.ready = false;
    this.blocked = new Set();
    this.stats = { dropped: 0, allowed: 0, blocked: 0, rate: 0, dropRate: 0 };
    this._pendingCmds = [];
    this._lineBuf = '';
  }

  /** Locate wirechar-divert.exe in the installed app's resources/. Returns
   *  null when not present (= portable build or dev mode). */
  static findHelper() {
    // Resolve relative to the running app
    const candidates = [];
    if (process.resourcesPath) {
      // Packaged app (Electron): <app>/resources/windivert/wirechar-divert.exe
      candidates.push(path.join(process.resourcesPath, 'windivert', 'wirechar-divert.exe'));
    }
    // Dev mode: build/windivert-helper/wirechar-divert.exe
    candidates.push(path.join(__dirname, '..', 'build', 'windivert-helper', 'wirechar-divert.exe'));
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  isAvailable() {
    return WinDivertFirewall.findHelper() !== null;
  }

  start() {
    if (this.proc) return true;
    const exe = WinDivertFirewall.findHelper();
    if (!exe) return false;

    try {
      this.proc = spawn(exe, [], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (e) {
      this.emit('error', e);
      return false;
    }

    this.proc.stdout.on('data', (chunk) => this._onStdout(chunk.toString('utf8')));
    this.proc.stderr.on('data', (chunk) => {
      this.emit('error', new Error('helper stderr: ' + chunk.toString('utf8').trim()));
    });
    this.proc.on('exit', (code) => {
      this.proc = null;
      this.ready = false;
      this.emit('exit', code);
    });
    return true;
  }

  _onStdout(text) {
    this._lineBuf += text;
    let idx;
    while ((idx = this._lineBuf.indexOf('\n')) >= 0) {
      const line = this._lineBuf.slice(0, idx).trim();
      this._lineBuf = this._lineBuf.slice(idx + 1);
      this._handleLine(line);
    }
  }

  _handleLine(line) {
    if (!line) return;
    if (line.startsWith('READY')) {
      this.ready = true;
      this.emit('ready');
      // Flush queued commands
      for (const c of this._pendingCmds) this._writeRaw(c);
      this._pendingCmds = [];
    } else if (line.startsWith('STATS ')) {
      const m = {};
      for (const tok of line.slice(6).split(/\s+/)) {
        const [k, v] = tok.split('=');
        m[k] = parseFloat(v);
      }
      this.stats = {
        dropped:  m.dropped  || 0,
        allowed:  m.allowed  || 0,
        blocked:  m.blocked  || 0,
        rate:     m.rate     || 0,
        dropRate: m.drop_rate || 0,
      };
      this.emit('stats', this.stats);
    } else if (line.startsWith('ERR ')) {
      this.emit('error', new Error(line.slice(4)));
    } else if (line.startsWith('OK')) {
      // ignored
    }
  }

  _writeRaw(line) {
    if (!this.proc || !this.proc.stdin.writable) return;
    try {
      this.proc.stdin.write(line + '\n');
    } catch (e) {
      this.emit('error', e);
    }
  }

  _send(line) {
    if (!this.ready) {
      this._pendingCmds.push(line);
      return;
    }
    this._writeRaw(line);
  }

  block(ip) {
    if (!ip || this.blocked.has(ip)) return false;
    this.blocked.add(ip);
    this._send(`ADD ${ip}`);
    return true;
  }

  unblock(ip) {
    if (!this.blocked.delete(ip)) return false;
    this._send(`DEL ${ip}`);
    return true;
  }

  clear() {
    this.blocked.clear();
    this._send('CLEAR');
  }

  list() {
    return Array.from(this.blocked);
  }

  stop() {
    if (!this.proc) return;
    this._send('QUIT');
    setTimeout(() => {
      if (this.proc) {
        try { this.proc.kill(); } catch (_) {}
        this.proc = null;
      }
    }, 500);
  }
}

module.exports = WinDivertFirewall;
