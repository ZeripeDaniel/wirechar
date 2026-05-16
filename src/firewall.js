/**
 * Windows Firewall management — equivalent of fail2ban on Linux.
 * Uses `netsh advfirewall` to add/remove inbound block rules.
 * Requires administrator privileges (capture already requires this).
 */
const { exec } = require('child_process');

const RULE_PREFIX = 'Wirechar-Block-';

function blockIP(ip, durationMs = 3600000) {
  return new Promise((resolve) => {
    const name = `${RULE_PREFIX}${ip}`;
    const cmd = `netsh advfirewall firewall add rule name="${name}" dir=in action=block remoteip=${ip} profile=any`;
    exec(cmd, { windowsHide: true, timeout: 5000 }, (err, stdout, stderr) => {
      if (err) return resolve({ ok: false, error: stderr || err.message });
      resolve({ ok: true, ip, until: Date.now() + durationMs });
    });
  });
}

function unblockIP(ip) {
  return new Promise((resolve) => {
    const name = `${RULE_PREFIX}${ip}`;
    const cmd = `netsh advfirewall firewall delete rule name="${name}"`;
    exec(cmd, { windowsHide: true, timeout: 5000 }, () => resolve({ ok: true, ip }));
  });
}

function listBlocked() {
  return new Promise((resolve) => {
    const cmd = `netsh advfirewall firewall show rule name=all dir=in`;
    exec(cmd, { windowsHide: true, timeout: 10000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      if (err) return resolve([]);
      const ips = new Set();
      const lines = stdout.split(/\r?\n/);
      // Format varies by locale; match prefix + IP from "Rule Name: Wirechar-Block-1.2.3.4"
      const re = new RegExp(`${RULE_PREFIX}([0-9.]+)`);
      for (const line of lines) {
        const m = line.match(re);
        if (m) ips.add(m[1]);
      }
      resolve(Array.from(ips));
    });
  });
}

async function unblockAll() {
  const ips = await listBlocked();
  await Promise.all(ips.map(ip => unblockIP(ip)));
  return ips.length;
}

module.exports = { blockIP, unblockIP, listBlocked, unblockAll, RULE_PREFIX };
