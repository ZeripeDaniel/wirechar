/**
 * Brand badges for well-known services.
 *
 * Two layers:
 *   1) Pattern → brand ID         (host regex → wirechar's internal slug)
 *   2) Brand ID → visual data
 *      - BRAND_ICONS (auto-generated from simple-icons): real official SVG path
 *      - MONOGRAM fallback for brands not in simple-icons
 *
 * Rendering uses Path2D + ctx.fill on the canvas — essentially free at GPU level
 * regardless of how many particles draw simultaneously.
 */
import { BRAND_ICONS } from './brand-icons-data.js';

// Host pattern → brand ID
// IDs must match keys in BRAND_ICONS or MONOGRAM table.
const HOST_RULES = [
  // Korean
  [/(^|\.)(naver|pstatic|navercorp|nstore|nrise|veta)\b/,            'naver'],
  [/(^|\.)(kakao|kakaocdn|kakaopay|kakaobank|kakaobrain|daum)\b/,    'kakao'],
  [/coupang/,                                                         'coupang'],
  [/toss\.im|tossbank|tossinvest/,                                    'toss'],
  [/baemin|woowahan/,                                                 'baemin'],
  [/line\.me|line-scdn|naver\.jp/,                                    'line'],

  // Search / Web
  [/(^|\.)(google\.[a-z.]+|googleapis|gstatic|googleusercontent|googlesyndication)\b/, 'google'],
  [/youtube|youtu\.be|googlevideo|ytimg/,                             'youtube'],
  [/bing\.com|msn\.com/,                                              'bing'],
  [/duckduckgo/,                                                       'duckduckgo'],

  // Messaging
  [/discord(app)?/,                                                    'discord'],
  [/telegram|t\.me|telegra\.ph/,                                       'telegram'],
  [/whatsapp|wa\.me/,                                                  'whatsapp'],
  [/signal\.org/,                                                      'signal'],
  [/slack\.com|slackb|slackcdn|slack-edge/,                            'slack'],

  // Streaming
  [/netflix|nflxvideo|nflximg/,                                        'netflix'],
  [/twitch|ttvnw|jtvnw/,                                               'twitch'],
  [/spotify|scdn\.co/,                                                 'spotify'],
  [/vimeo|dailymotion|dmcdn/,                                          'vimeo'],
  [/soundcloud|sndcdn/,                                                'soundcloud'],
  [/apple\.music|music\.apple/,                                        'applemusic'],

  // Game
  [/steam(content|powered|community|static|cdn)|valvesoftware/,        'steam'],
  [/epicgames|unrealengine|fortnite/,                                  'epic'],
  [/leagueoflegends/,                                                  'leagueoflegends'],
  [/riotgames|riotcdn/,                                                'riot'],
  [/battle\.net|blizzard|battlenet/,                                   'battlenet'],
  [/roblox|rbxcdn/,                                                    'roblox'],
  [/ea\.com|easports|origin\.com/,                                     'ea'],

  // Social
  [/twitter\.com|x\.com|twimg|t\.co/,                                  'x'],
  [/facebook\.com|fbcdn|facebook\.net/,                                'facebook'],
  [/instagram|cdninstagram/,                                           'instagram'],
  [/reddit|redditmedia|redditstatic/,                                  'reddit'],
  [/tiktok|tiktokcdn|tiktokv/,                                         'tiktok'],
  [/threads\.net|threads\.com/,                                        'threads'],
  [/pinterest|pinimg/,                                                 'pinterest'],
  [/linkedin|licdn/,                                                   'linkedin'],

  // AI
  [/openai|chatgpt|oaistatic|oaiusercontent/,                          'openai'],
  [/anthropic|claude\.ai|claudeusercontent/,                           'anthropic'],
  [/gemini\.google|bard\.google|aistudio\.google/,                     'gemini'],
  [/huggingface|hf\.co/,                                               'huggingface'],
  [/perplexity/,                                                        'perplexity'],

  // Dev
  [/github\.com|githubusercontent|githubassets/,                       'github'],
  [/gitlab/,                                                            'gitlab'],
  [/bitbucket/,                                                         'bitbucket'],
  [/stackoverflow|stackexchange/,                                       'stackoverflow'],

  // Cloud
  [/cloudflare/,                                                        'cloudflare'],
  [/amazonaws|cloudfront|elb\.amazonaws|s3\.amazonaws/,                'aws'],
  [/azure|azureedge|trafficmanager|cloudapp/,                          'azure'],
  [/microsoftonline|office\.com|live\.com|sharepoint|onedrive|outlook|teams\.microsoft|microsoft\.com/, 'microsoft'],
  [/apple\.com|icloud|mzstatic|aaplimg/,                               'apple'],
  [/dropbox/,                                                           'dropbox'],

  // Misc
  [/zoom\.us|zoomgov|zoomcdn/,                                          'zoom'],
  [/amazon\.com|aliexpress/,                                            'amazon'],
  [/ebay/,                                                              'ebay'],
  [/paypal/,                                                            'paypal'],
  [/stripe\.com/,                                                       'stripe'],
  [/windowsupdate|update\.microsoft|msftncsi|windows\./,                'windows'],
];

// Fallback monograms for brands without simple-icons SVG.
// Renderer draws colored rounded square + this text.
const MONOGRAM = {
  coupang:     { hex: '#a30210', fg: '#ffffff', text: 'C' },
  toss:        { hex: '#0064ff', fg: '#ffffff', text: 'T' },
  baemin:      { hex: '#2ac1bc', fg: '#ffffff', text: '배' },
  huggingface: { hex: '#ffcc4d', fg: '#000000', text: '🤗' },
};

// Brand id → a host string that matches its HOST_RULES regex.
// Used when the user manually tags an IP (we store this as the cached host
// so the existing findBrand() pipeline picks it up unchanged).
const BRAND_CANONICAL = {
  naver: 'naver.com', kakao: 'kakao.com', line: 'line.me',
  coupang: 'coupang.com', toss: 'toss.im', baemin: 'baemin.com',
  google: 'google.com', youtube: 'youtube.com',
  bing: 'bing.com', duckduckgo: 'duckduckgo.com',
  discord: 'discord.com', telegram: 'telegram.org', whatsapp: 'whatsapp.com',
  signal: 'signal.org', slack: 'slack.com',
  netflix: 'netflix.com', twitch: 'twitch.tv', spotify: 'spotify.com',
  vimeo: 'vimeo.com', soundcloud: 'soundcloud.com',
  applemusic: 'music.apple.com',
  steam: 'steampowered.com', epic: 'epicgames.com',
  leagueoflegends: 'leagueoflegends.com', riot: 'riotgames.com',
  battlenet: 'battle.net', roblox: 'roblox.com', ea: 'ea.com',
  x: 'x.com', facebook: 'facebook.com', instagram: 'instagram.com',
  reddit: 'reddit.com', tiktok: 'tiktok.com', threads: 'threads.net',
  pinterest: 'pinterest.com', linkedin: 'linkedin.com',
  openai: 'openai.com', anthropic: 'anthropic.com',
  gemini: 'gemini.google.com', huggingface: 'huggingface.co',
  perplexity: 'perplexity.ai',
  github: 'github.com', gitlab: 'gitlab.com',
  bitbucket: 'bitbucket.org', stackoverflow: 'stackoverflow.com',
  cloudflare: 'cloudflare.com', aws: 'amazonaws.com', azure: 'azure.com',
  microsoft: 'microsoft.com', apple: 'apple.com', dropbox: 'dropbox.com',
  zoom: 'zoom.us', amazon: 'amazon.com', ebay: 'ebay.com',
  paypal: 'paypal.com', stripe: 'stripe.com', windows: 'windowsupdate.com',
};

/**
 * List every known brand sorted alphabetically by title.
 * Used by the renderer's "Tag as brand…" picker.
 * Returns: [{ id, title, host, hex }]
 */
export function getAllBrands() {
  const ids = new Set();
  for (const [, id] of HOST_RULES) ids.add(id);
  const out = [];
  for (const id of ids) {
    const svg = BRAND_ICONS[id];
    const mono = MONOGRAM[id];
    const title = svg?.title || (mono ? id.charAt(0).toUpperCase() + id.slice(1) : id);
    const hex   = svg?.hex   || mono?.hex || '#888888';
    const host  = BRAND_CANONICAL[id] || id;
    out.push({ id, title, host, hex });
  }
  out.sort((a, b) => a.title.localeCompare(b.title));
  return out;
}

/** Canonical host string to cache when a user manually tags an IP as `id`. */
export function brandCanonicalHost(id) {
  return BRAND_CANONICAL[id] || id;
}

/**
 * Resolve a host to a brand record.
 *   { kind: 'svg', id, title, hex, path }   — real official logo, Path2D-drawn
 *   { kind: 'mono', id, hex, fg, text }     — monogram fallback
 *   null                                     — no brand match
 */
export function findBrand(host) {
  if (!host) return null;
  const h = String(host).toLowerCase();
  for (const [re, id] of HOST_RULES) {
    if (!re.test(h)) continue;
    const svg = BRAND_ICONS[id];
    if (svg) {
      return { kind: 'svg', id, title: svg.title, hex: svg.hex, path: svg.path };
    }
    const mono = MONOGRAM[id];
    if (mono) {
      return { kind: 'mono', id, hex: mono.hex, fg: mono.fg, text: mono.text };
    }
    // Pattern matched but no visual data — treat as unknown
    return null;
  }
  return null;
}

// Cache Path2D objects so we don't re-parse SVG strings every frame
const _path2dCache = new Map();
function getPath2D(d) {
  let p = _path2dCache.get(d);
  if (!p) {
    p = new Path2D(d);
    _path2dCache.set(d, p);
  }
  return p;
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}

/**
 * Draw a brand badge at (cx, cy) with the given outer size.
 * For SVG-backed brands: rounded color tile + the actual logo glyph in white
 *   (simple-icons paths are single-color silhouettes designed for tinting).
 * For monogram brands: rounded color tile + the text.
 */
export function drawBrandIcon(ctx, cx, cy, size, brand) {
  const r = size / 2;
  const radius = Math.max(2, r * 0.30);

  // Soft halo in brand color so it pops on the dark canvas
  const halo = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 1.7);
  halo.addColorStop(0, brand.hex + '80');
  halo.addColorStop(1, brand.hex + '00');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.7, 0, Math.PI * 2);
  ctx.fill();

  // Background tile
  ctx.fillStyle = brand.hex;
  roundedRect(ctx, cx - r, cy - r, size, size, radius);
  ctx.fill();

  // Subtle highlight rim
  ctx.strokeStyle = 'rgba(255,255,255,0.20)';
  ctx.lineWidth = 1;
  roundedRect(ctx, cx - r + 0.5, cy - r + 0.5, size - 1, size - 1, radius);
  ctx.stroke();

  if (brand.kind === 'svg') {
    // Draw the official logo path. simple-icons uses 24x24 viewBox.
    // Inset slightly so the logo doesn't touch the tile edges.
    const inset = size * 0.18;
    const glyphSize = size - inset * 2;
    const scale = glyphSize / 24;
    ctx.save();
    ctx.translate(cx - glyphSize / 2, cy - glyphSize / 2);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#ffffff';
    // For very light brand colors (yellow Kakao, etc.) use dark fill instead
    if (isLightColor(brand.hex)) ctx.fillStyle = '#1a1a1a';
    ctx.fill(getPath2D(brand.path));
    ctx.restore();
  } else if (brand.kind === 'mono') {
    const len = brand.text.length;
    const fontSize = Math.floor(size * (len === 1 ? 0.62 : len === 2 ? 0.46 : 0.34));
    ctx.fillStyle = brand.fg;
    ctx.font = `bold ${fontSize}px Consolas, "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(brand.text, cx, cy + size * 0.04);
  }
}

function isLightColor(hex) {
  // Quick perceived-brightness check (0–255). Returns true if light.
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 175;
}
