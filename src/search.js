/**
 * Same query compiler as renderer/search.js but in CommonJS for the main process.
 * Keeps the syntax identical between front-end and back-end log search.
 */

const RE_CIDR = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d{1,2})$/;
const RE_IP_WILD = /^[\d*?]+\.[\d*?]+\.[\d*?]+\.[\d*?]+$/;
const RE_FIELD = /^(port|proto|protocol|tag|host|sni|src|dst|mac):(.+)$/i;

function ipToInt(ip) {
  const p = ip.split('.');
  if (p.length !== 4) return null;
  let n = 0;
  for (const part of p) {
    const v = +part;
    if (isNaN(v) || v < 0 || v > 255) return null;
    n = (n << 8) | v;
  }
  return n >>> 0;
}

function cidrMatcher(cidr) {
  const m = cidr.match(RE_CIDR);
  if (!m) return null;
  const base = ipToInt(m[1]);
  const bits = +m[2];
  if (base == null || bits < 0 || bits > 32) return null;
  const mask = bits === 0 ? 0 : ((~0 << (32 - bits)) >>> 0);
  const target = base & mask;
  return (ip) => {
    const n = ipToInt(ip);
    return n != null && (n & mask) === target;
  };
}

function wildcardToRegex(pattern) {
  const esc = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp('^' + esc + '$', 'i');
}

function tokenize(query) {
  const out = [];
  const re = /"([^"]*)"|\S+/g;
  let m;
  while ((m = re.exec(query)) !== null) {
    out.push(m[1] !== undefined ? m[1] : m[0]);
  }
  return out;
}

function compileTerm(term) {
  if (RE_CIDR.test(term)) {
    const match = cidrMatcher(term);
    return (p) => (p.src && match(p.src)) || (p.dst && match(p.dst));
  }
  const fm = term.match(RE_FIELD);
  if (fm) {
    const field = fm[1].toLowerCase();
    const val = fm[2].toLowerCase();
    const isWild = val.includes('*') || val.includes('?');
    const re = isWild ? wildcardToRegex(val) : null;
    const check = (v) => {
      if (v == null) return false;
      const s = String(v).toLowerCase();
      return re ? re.test(s) : s.includes(val);
    };
    switch (field) {
      case 'port':
        return (p) => check(p.tcpDstPort) || check(p.tcpSrcPort) || check(p.udpDstPort) || check(p.udpSrcPort);
      case 'proto': case 'protocol': return (p) => check(p.protocol);
      case 'tag':                    return (p) => check(p._class && p._class.tag);
      case 'host':                   return (p) => check(p.host);
      case 'sni':                    return (p) => check(p.sni);
      case 'src':                    return (p) => check(p.src);
      case 'dst':                    return (p) => check(p.dst);
      case 'mac':                    return (p) => check(p.ethSrc) || check(p.ethDst);
    }
  }
  if (RE_IP_WILD.test(term) && (term.includes('*') || term.includes('?'))) {
    const re = wildcardToRegex(term);
    return (p) => (p.src && re.test(p.src)) || (p.dst && re.test(p.dst));
  }
  if (term.includes('*') || term.includes('?')) {
    const re = wildcardToRegex(term);
    return (p) => {
      const hay = `${p.protocol||''} ${p.host||''} ${p.sni||''} ${p.src||''} ${p.dst||''}`.toLowerCase();
      return re.test(hay) || hay.split(/\s+/).some(x => re.test(x));
    };
  }
  const needle = term.toLowerCase();
  return (p) => {
    const hay = `${p.protocol||''} ${p.host||''} ${p.sni||''} ${p.src||''} ${p.dst||''} ${p.tcpDstPort||''} ${p.tcpSrcPort||''} ${p.udpDstPort||''} ${p.udpSrcPort||''} ${p.ethSrc||''} ${p.ethDst||''}`.toLowerCase();
    return hay.includes(needle);
  };
}

function compileQuery(query) {
  const q = (query || '').trim();
  if (!q) return () => true;
  const terms = tokenize(q).map(compileTerm).filter(Boolean);
  if (terms.length === 0) return () => true;
  if (terms.length === 1) return terms[0];
  return (p) => terms.every(t => t(p));
}

/** Cheap pre-filter on raw lines for plain substring queries — skips JSON.parse. */
function rawLinePrefilter(query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return null;
  if (q.includes(':') || q.includes('*') || q.includes('?') || q.includes('/')) return null;
  // Quoted: strip quotes
  const needle = q.replace(/^"|"$/g, '');
  return (line) => line.toLowerCase().includes(needle);
}

module.exports = { compileQuery, rawLinePrefilter };
