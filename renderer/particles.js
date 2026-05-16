/**
 * Particle system for network traffic visualization.
 * Incoming packets: fly from edges toward the character.
 * Outgoing packets: fly from character toward edges.
 */
import { findBrand, drawBrandIcon } from './brand-styles.js';

const PROTOCOL_COLORS = {
  HTTP:       '#4caf50',
  HTTPS:      '#2196f3',
  DNS:        '#ff9800',
  TCP:        '#9c27b0',
  UDP:        '#00bcd4',
  ICMP:       '#f44336',
  SSH:        '#e91e63',
  FTP:        '#795548',
  SMTP:       '#607d8b',
  default:    '#78909c',
};

const PROTOCOL_ICONS = {
  HTTP:  '🌐',
  HTTPS: '🔒',
  DNS:   '🔍',
  TCP:   '⚡',
  UDP:   '📡',
  ICMP:  '🏓',
  SSH:   '🔐',
  FTP:   '📁',
  SMTP:  '📧',
  default: '📦',
};

// Cache for loaded favicon images
const faviconCache = new Map();

function getFaviconUrl(host) {
  if (!host) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`;
}

function loadFavicon(host) {
  if (!host) return Promise.resolve(null);
  if (faviconCache.has(host)) return Promise.resolve(faviconCache.get(host));

  const url = getFaviconUrl(host);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      faviconCache.set(host, img);
      resolve(img);
    };
    img.onerror = () => {
      faviconCache.set(host, null);
      resolve(null);
    };
    img.src = url;
    setTimeout(() => resolve(null), 3000);
  });
}

// Easing functions
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeOutQuad(t) {
  return 1 - (1 - t) * (1 - t);
}

// Pixel-art demon face (purple + red) drawn programmatically
// Used for incoming attack packets
function drawDemon(ctx, cx, cy, size) {
  const px = Math.max(2, Math.floor(size / 14));  // pixel size
  const w = 12 * px, h = 12 * px;
  const ox = Math.round(cx - w / 2), oy = Math.round(cy - h / 2);

  // Palette
  const PURPLE_DARK = '#3a0a4a';
  const PURPLE = '#7a1abf';
  const PURPLE_LIGHT = '#b04cff';
  const RED = '#ff2244';
  const RED_DARK = '#aa0022';
  const EYE_GLOW = '#ffff66';
  const BLACK = '#0a0010';

  // 12x12 demon pixel map
  // P=purple, p=purple light, D=purple dark, R=red, r=red dark, E=eye glow, K=black, _=transparent
  const map = [
    '_RR______RR_',
    'rRRR____RRRr',
    'rRRDPPPPPDRr',  // horns + head top
    '_PPPpppppPP_',
    'PPpppPPppppP',
    'PpEEKppKEEpP',  // eyes (E=glow, K=pupil)
    'PpEEKppKEEpP',
    'PppPPPPPPPpP',
    'PPppKKKKpppP',  // grimace
    '_PPpKpppKppP',  // fangs (K)
    '_DPpppppppPD',
    '__DDPPPPPDD_',
  ];
  const colors = {
    _: null,
    R: RED, r: RED_DARK,
    P: PURPLE, p: PURPLE_LIGHT, D: PURPLE_DARK,
    E: EYE_GLOW, K: BLACK,
  };

  // Glow halo
  const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, size);
  halo.addColorStop(0, 'rgba(170,30,255,0.55)');
  halo.addColorStop(0.5, 'rgba(255,30,80,0.25)');
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, size, 0, Math.PI * 2);
  ctx.fill();

  // Pixel art
  for (let r = 0; r < map.length; r++) {
    for (let c = 0; c < map[r].length; c++) {
      const ch = map[r][c];
      const col = colors[ch];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(ox + c * px, oy + r * px, px, px);
    }
  }
}

export class Particle {
  constructor({ direction, charX, charY, canvasW, canvasH, protocol, host, size, attack, lane }) {
    this.direction = direction; // 'in' or 'out'
    this.protocol = protocol || 'TCP';
    this.host = host || null;
    this.size = size || 100;
    this.attack = !!attack;
    this.age = 0;
    this.duration = attack ? (700 + Math.random() * 200) : (1100 + Math.random() * 200);
    this.dead = false;
    this.favicon = null;
    this.iconSize = attack ? 30 : 26;
    this.opacity = 0;
    this.trail = [];
    this.maxTrail = attack ? 12 : 6;

    // Known brand? (Discord/Naver/Google/etc.) — use brand colors and skip favicon.
    this.brand = (!attack && host) ? findBrand(host) : null;

    const color = attack
      ? '#ff2244'
      : (this.brand ? this.brand.hex : (PROTOCOL_COLORS[protocol] || PROTOCOL_COLORS.default));
    this.color = color;
    this.glowColor = attack ? '#aa00ff' : (this.brand ? this.brand.hex : color);

    // ── Lane-based positioning ─────────────────────────────────────────────
    // Each host owns one direction (lane.angle). In particles flow inward
    // along the lane; out particles flow outward along the SAME lane but on
    // a parallel offset → 2-lane road visual.
    const angle = lane?.angle ?? (Math.random() * Math.PI * 2);
    const dist  = Math.min(canvasW, canvasH) * 0.42;
    const perpAngle = angle + Math.PI / 2;
    const LANE_OFFSET = 10;       // perpendicular separation between in/out lines
    const offset = direction === 'in' ? -LANE_OFFSET : LANE_OFFSET;

    // Endpoint at lane edge
    const farX = charX + Math.cos(angle) * dist + Math.cos(perpAngle) * offset;
    const farY = charY + Math.sin(angle) * dist + Math.sin(perpAngle) * offset;
    // Near end at character (slightly offset perpendicular)
    const nearX = charX + Math.cos(perpAngle) * offset;
    const nearY = charY + Math.sin(perpAngle) * offset;

    if (direction === 'in') {
      this.sx = farX;  this.sy = farY;
      this.tx = nearX; this.ty = nearY;
    } else {
      this.sx = nearX; this.sy = nearY;
      this.tx = farX;  this.ty = farY;
    }

    this.x = this.sx;
    this.y = this.sy;
    // No curve — straight lane (so same-host packets read as a tidy line)
    this.cpx = (this.sx + this.tx) / 2;
    this.cpy = (this.sy + this.ty) / 2;

    // Favicon fetch ONLY when no brand match (brand badge looks better anyway)
    if (host && !attack && !this.brand) {
      loadFavicon(host).then(img => { this.favicon = img; });
    }
  }

  update(dt) {
    this.age += dt;
    const t = Math.min(this.age / this.duration, 1);

    // Quadratic bezier position
    const t1 = 1 - t;
    this.x = t1 * t1 * this.sx + 2 * t1 * t * this.cpx + t * t * this.tx;
    this.y = t1 * t1 * this.sy + 2 * t1 * t * this.cpy + t * t * this.ty;

    // Trail
    this.trail.unshift({ x: this.x, y: this.y, t });
    if (this.trail.length > this.maxTrail) this.trail.pop();

    // Opacity: fade in/out
    if (t < 0.1) {
      this.opacity = t / 0.1;
    } else if (t > 0.85) {
      this.opacity = (1 - t) / 0.15;
    } else {
      this.opacity = 1;
    }

    if (t >= 1) this.dead = true;
  }

  draw(ctx) {
    if (this.opacity <= 0) return;
    ctx.save();
    ctx.globalAlpha = this.opacity;

    // Draw trail
    if (this.trail.length > 1) {
      for (let i = 0; i < this.trail.length - 1; i++) {
        const pt = this.trail[i];
        const alpha = (1 - i / this.trail.length) * 0.4 * this.opacity;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.color;
        const r = Math.max(1, (this.trail.length - i) * 1.2 - 1);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = this.opacity;
    }

    // Glow
    const glowGrad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, 22);
    glowGrad.addColorStop(0, this.color + 'aa');
    glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(this.x, this.y, 22, 0, Math.PI * 2);
    ctx.fill();

    const s = this.iconSize;

    // Attack particle: render as purple demon icon
    if (this.attack) {
      drawDemon(ctx, this.x, this.y, s);
      ctx.restore();
      return;
    }

    // Known brand: render colored badge with brand monogram
    if (this.brand) {
      drawBrandIcon(ctx, this.x, this.y, s, this.brand);
      ctx.restore();
      return;
    }

    if (this.favicon) {
      // Favicon image in a rounded box
      ctx.save();
      ctx.beginPath();
      const r = 6;
      const bx = this.x - s / 2, by = this.y - s / 2;
      ctx.moveTo(bx + r, by);
      ctx.lineTo(bx + s - r, by);
      ctx.arcTo(bx + s, by, bx + s, by + r, r);
      ctx.lineTo(bx + s, by + s - r);
      ctx.arcTo(bx + s, by + s, bx + s - r, by + s, r);
      ctx.lineTo(bx + r, by + s);
      ctx.arcTo(bx, by + s, bx, by + s - r, r);
      ctx.lineTo(bx, by + r);
      ctx.arcTo(bx, by, bx + r, by, r);
      ctx.closePath();
      ctx.fillStyle = 'rgba(10,14,26,0.85)';
      ctx.fill();
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.clip();
      ctx.drawImage(this.favicon, bx + 4, by + 4, s - 8, s - 8);
      ctx.restore();
    } else {
      // Protocol icon circle
      ctx.beginPath();
      ctx.arc(this.x, this.y, s / 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(10,14,26,0.85)';
      ctx.fill();
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 2;
      ctx.stroke();

      const icon = PROTOCOL_ICONS[this.protocol] || PROTOCOL_ICONS.default;
      ctx.font = `${Math.floor(s * 0.5)}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(icon, this.x, this.y + 1);
    }

    // Direction arrow badge
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const arrow = this.direction === 'in' ? '↓' : '↑';
    const badgeColor = this.direction === 'in' ? '#4cffaa' : '#ff6644';
    ctx.fillStyle = 'rgba(10,14,26,0.8)';
    ctx.fillRect(this.x + s / 2 - 2, this.y - s / 2 - 2, 11, 12);
    ctx.fillStyle = badgeColor;
    ctx.fillText(arrow, this.x + s / 2 - 1, this.y - s / 2 - 1);

    ctx.restore();
  }

  // Returns true if particle just hit the character (for incoming)
  justArrived() {
    if (this.direction !== 'in') return false;
    const t = this.age / this.duration;
    return t >= 0.95 && t < 0.98;
  }
}

/**
 * Lane manager: assigns each remote host a fixed angle around the character.
 * Same host → same lane → same flight path (reduces visual chaos).
 * Lanes are evenly spaced; reused via LRU when slots are full.
 */
class LaneManager {
  constructor(slots = 16) {
    this.slots = slots;
    this.hostToLane = new Map();         // key → { angle, lastUsed }
    this.usedSlots = new Set();           // slot indices currently in use
  }

  get(key) {
    if (!key) key = '_unknown_';
    let lane = this.hostToLane.get(key);
    const now = Date.now();
    if (lane) { lane.lastUsed = now; return lane; }

    // Find a free slot
    let slot = -1;
    for (let i = 0; i < this.slots; i++) {
      if (!this.usedSlots.has(i)) { slot = i; break; }
    }
    if (slot < 0) {
      // All slots used — evict least-recently-used host
      let oldestKey = null, oldestT = Infinity;
      for (const [k, l] of this.hostToLane) {
        if (l.lastUsed < oldestT) { oldestT = l.lastUsed; oldestKey = k; }
      }
      if (oldestKey) {
        slot = this.hostToLane.get(oldestKey).slot;
        this.hostToLane.delete(oldestKey);
        this.usedSlots.delete(slot);
      } else slot = 0;
    }
    this.usedSlots.add(slot);
    // Distribute angles evenly, start at -90° (north) so first host is top
    const angle = (slot / this.slots) * Math.PI * 2 - Math.PI / 2;
    lane = { angle, slot, lastUsed: now };
    this.hostToLane.set(key, lane);
    return lane;
  }

  // Evict hosts not seen for `maxAgeMs`
  prune(maxAgeMs = 30000) {
    const now = Date.now();
    for (const [k, l] of this.hostToLane) {
      if (now - l.lastUsed > maxAgeMs) {
        this.hostToLane.delete(k);
        this.usedSlots.delete(l.slot);
      }
    }
  }
}

export class ParticleSystem {
  constructor() {
    this.particles = [];
    this.lanes = new LaneManager(16);
    this._pruneTimer = setInterval(() => this.lanes.prune(), 5000);
  }

  spawn(options) {
    // Resolve lane from host/IP key
    const key = options.host || options.remoteIP || options.protocol || '_unknown_';
    options.lane = this.lanes.get(key);
    this.particles.push(new Particle(options));
    if (this.particles.length > 80) {
      this.particles.splice(0, this.particles.length - 80);
    }
  }

  update(dt) {
    for (const p of this.particles) p.update(dt);
    this.particles = this.particles.filter(p => !p.dead);
  }

  draw(ctx) {
    for (const p of this.particles) p.draw(ctx);
  }

  // Returns true if any incoming particle just arrived
  checkArrivals() {
    return this.particles.some(p => p.justArrived());
  }

  // Returns true if any outgoing particle just launched
  checkLaunches(since) {
    return this.particles.some(p => p.direction === 'out' && p.age < 100);
  }
}
