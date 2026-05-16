/**
 * Trusted-host registry — well-known service providers that should never
 * be flagged as flood/DDoS sources. CDNs, search engines, video streaming,
 * cloud platforms, etc. all routinely send hundreds of packets/sec to
 * clients during legitimate use.
 *
 * Three matching layers:
 *   1) Host pattern match  (SNI / HTTP host / DNS query) — most reliable
 *   2) Reverse mapping cache (ip → host) populated at runtime as we observe SNI
 *   3) Static CIDR list — fallback when no host info available yet
 */

const TRUSTED_HOST_PATTERNS = [
  // ── AI / chatbot platforms ──
  /(^|\.)(anthropic|claude\.ai|claudeusercontent)(\.|$)/i,
  /(^|\.)(openai|chatgpt|oaistatic|oaiusercontent)(\.|$)/i,
  /(^|\.)(gemini\.google|bard\.google|aistudio\.google)(\.|$)/i,
  /(^|\.)(huggingface|hf\.co)(\.|$)/i,
  /(^|\.)(cohere|mistral|perplexity)(\.|$)/i,

  // ── Search / web giants ──
  /(^|\.)(google\.[a-z.]+|googleapis|gstatic|googleusercontent|googlevideo|googlesyndication|1e100\.net)(\.|$)/i,
  /(^|\.)(youtube|youtu\.be|ytimg)(\.|$)/i,
  /(^|\.)(bing|live|msn|microsoft|microsoftonline)(\.|$)/i,
  /(^|\.)(duckduckgo|brave|kagi)(\.|$)/i,
  /(^|\.)(yandex)(\.|$)/i,

  // ── Korean portals / services ──
  /(^|\.)(naver|pstatic|navercorp|nstore|veta|nrise)(\.|$)/i,
  /(^|\.)(daum|kakao|kakaocdn|kakaopay|kakaobank|kakaobrain)(\.|$)/i,
  /(^|\.)(coupang|coupangcdn)(\.|$)/i,
  /(^|\.)(nexon|maplestory|sudden\.kr|netmarble|krafton|smilegate)(\.|$)/i,
  /(^|\.)(toss\.im|tossbank|tossinvest)(\.|$)/i,
  /(^|\.)(navercorp|nhnent|nhn|hancom)(\.|$)/i,

  // ── CDN / cloud edge ──
  /(^|\.)(cloudflare|cloudflarestatus|cloudflareresolve)(\.|$)/i,
  /(^|\.)(akamai|akamaihd|akamaitechnologies|akamaized|edgekey|edgesuite)(\.|$)/i,
  /(^|\.)(fastly|fastlylb)(\.|$)/i,
  /(^|\.)(cloudfront|amazonaws|aws|s3\.amazonaws|elb\.amazonaws)(\.|$)/i,
  /(^|\.)(azureedge|azure|azurewebsites|core\.windows|trafficmanager|cloudapp)(\.|$)/i,
  /(^|\.)(githubusercontent|githubassets|github)(\.|$)/i,
  /(^|\.)(jsdelivr|unpkg|cdnjs|bootstrapcdn)(\.|$)/i,
  /(^|\.)(stackpath|stackpathcdn|stackpathdns|highwinds)(\.|$)/i,
  /(^|\.)(maxcdn|keycdn|bunnycdn|cdn77)(\.|$)/i,
  /(^|\.)(twimg|tiktokcdn|fbcdn|cdninstagram|pinimg)(\.|$)/i,

  // ── Cloud / SaaS ──
  /(^|\.)(microsoftonline|office|live|sharepoint|onedrive|outlook|teams\.microsoft)(\.|$)/i,
  /(^|\.)(apple|icloud|mzstatic|aaplimg|cdn-apple)(\.|$)/i,
  /(^|\.)(dropbox|dropboxstatic|dropboxusercontent)(\.|$)/i,
  /(^|\.)(google-analytics|googletagmanager|googleadservices|doubleclick)(\.|$)/i,

  // ── Streaming / media ──
  /(^|\.)(netflix|nflxvideo|nflximg|nflxext|nflxso)(\.|$)/i,
  /(^|\.)(twitch|ttvnw|jtvnw)(\.|$)/i,
  /(^|\.)(spotify|scdn|spotifycdn)(\.|$)/i,
  /(^|\.)(vimeo|vimeocdn|dailymotion|dmcdn)(\.|$)/i,
  /(^|\.)(apple\.music|music\.apple|itunes)(\.|$)/i,
  /(^|\.)(soundcloud|sndcdn)(\.|$)/i,

  // ── Messaging / social ──
  /(^|\.)(discord|discordapp|discordcdn)(\.|$)/i,
  /(^|\.)(telegram|t\.me|telegra\.ph|tdesktop)(\.|$)/i,
  /(^|\.)(whatsapp|wa\.me)(\.|$)/i,
  /(^|\.)(signal\.org)(\.|$)/i,
  /(^|\.)(slack|slackb|slackcdn|slack-edge)(\.|$)/i,
  /(^|\.)(zoom\.us|zoomgov|zoomcdn)(\.|$)/i,
  /(^|\.)(twitter|x\.com|twimg)(\.|$)/i,
  /(^|\.)(facebook|fbcdn|instagram|cdninstagram|threads)(\.|$)/i,
  /(^|\.)(reddit|redditmedia|redditstatic)(\.|$)/i,

  // ── Game platforms ──
  /(^|\.)(steam|steamcontent|steampowered|steamstatic|steamcommunity|steamcdn|valvesoftware)(\.|$)/i,
  /(^|\.)(epicgames|unrealengine|fortnite)(\.|$)/i,
  /(^|\.)(battle\.net|blizzard|battlenet)(\.|$)/i,
  /(^|\.)(riotgames|riotcdn|leagueoflegends)(\.|$)/i,
  /(^|\.)(mihoyo|hoyoverse|hoyolab|hoyowiki|genshin|honkai)(\.|$)/i,
  /(^|\.)(ea\.com|origin|easports)(\.|$)/i,
  /(^|\.)(roblox|rbxcdn)(\.|$)/i,

  // ── Update / OS services ──
  /(^|\.)(windowsupdate|update\.microsoft|msftncsi|msftconnecttest|deliveryworld)(\.|$)/i,
  /(^|\.)(swcatalog\.apple|appldnld|apple\.com\/itunes)(\.|$)/i,
  /(^|\.)(canonical|ubuntu|launchpad)(\.|$)/i,
];

// Static CIDR list — fallback when no host info available.
// IPv4 only. Kept compact; large providers cover the long-tail via host patterns.
const TRUSTED_CIDRS = [
  // Cloudflare
  '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22',
  '104.16.0.0/13',   '104.24.0.0/14',   '108.162.192.0/18',
  '131.0.72.0/22',   '141.101.64.0/18', '162.158.0.0/15',
  '172.64.0.0/13',   '173.245.48.0/20', '188.114.96.0/20',
  '190.93.240.0/20', '197.234.240.0/22','198.41.128.0/17',
  // Google / GCP
  // 8.x classic Google
  '8.8.4.0/24', '8.8.8.0/24', '8.34.208.0/20', '8.35.192.0/20',
  // 34.x GCP
  '34.0.0.0/15', '34.2.0.0/16', '34.16.0.0/12', '34.32.0.0/11',
  '34.64.0.0/10', '34.128.0.0/10',
  // 35.x GCP — single big block covers Discord voice/media + most GCE
  '35.184.0.0/13',   // 35.184-191
  '35.192.0.0/11',   // 35.192-223  (includes 35.213, 35.215, 35.216 Discord voice)
  '35.224.0.0/12',   // 35.224-239
  '35.240.0.0/13',   // 35.240-247
  // Classic Google ranges
  '64.233.160.0/19', '66.102.0.0/20', '66.249.64.0/19',
  '72.14.192.0/18', '74.125.0.0/16', '108.59.80.0/20',
  '108.170.192.0/18', '142.250.0.0/15', '172.217.0.0/16',
  '173.194.0.0/16', '209.85.128.0/17', '216.58.192.0/19',
  '216.239.32.0/19',
  // Amazon AWS / CloudFront (sampling — they own a LOT)
  '3.5.0.0/16', '13.32.0.0/15', '13.224.0.0/14', '13.249.0.0/16',
  '52.46.0.0/18', '52.84.0.0/15', '54.182.0.0/16', '54.192.0.0/16',
  '54.230.0.0/16', '54.239.128.0/18', '54.240.128.0/18',
  '99.84.0.0/16', '143.204.0.0/16',
  // Microsoft / Azure
  '13.64.0.0/11', '20.33.0.0/16', '20.36.0.0/14', '20.40.0.0/13',
  '20.64.0.0/10', '20.128.0.0/16', '23.96.0.0/13', '40.64.0.0/10',
  '52.96.0.0/12', '52.112.0.0/14', '52.120.0.0/14',
  '65.52.0.0/14', '70.37.0.0/17', '104.40.0.0/13', '104.146.0.0/15',
  '157.55.0.0/16', '157.56.0.0/14',
  // Akamai
  '23.0.0.0/12', '23.32.0.0/11', '23.64.0.0/14', '23.192.0.0/11',
  '69.192.0.0/16', '72.246.0.0/15', '88.221.0.0/16', '92.122.0.0/15',
  '95.100.0.0/15', '96.6.0.0/15', '96.16.0.0/15', '104.64.0.0/10',
  '184.24.0.0/13', '184.50.0.0/15', '184.84.0.0/14',
  // Apple
  '17.0.0.0/8',
  // Facebook / Meta
  '31.13.24.0/21', '66.220.144.0/20', '69.63.176.0/20',
  '69.171.224.0/19', '102.132.96.0/20', '157.240.0.0/16',
  '173.252.64.0/18', '179.60.192.0/22', '185.60.216.0/22',
  '204.15.20.0/22',
  // Public DNS resolvers
  '1.1.1.0/24', '1.0.0.0/24',           // Cloudflare DNS
  '9.9.9.0/24',                          // Quad9
  '208.67.222.0/24',                     // OpenDNS
  '168.126.63.0/24',                     // KT (KR) DNS
];

// Naver / Kakao Korean ranges (rough)
const KR_RANGES = [
  '125.209.222.0/24', '202.131.30.0/24',        // Naver
  '211.231.99.0/24',  '220.95.232.0/22',        // Naver
  '210.182.99.0/24',  '110.93.187.0/24',        // Naver
  '203.133.180.0/24', '110.45.146.0/24',        // Kakao
  '112.175.236.0/22', '101.55.41.0/24',         // Naver
];
TRUSTED_CIDRS.push(...KR_RANGES);

// ── IP arithmetic ────────────────────────────────────────────────────────────
function ipToInt(ip) {
  const p = (ip || '').split('.');
  if (p.length !== 4) return null;
  const a = +p[0], b = +p[1], c = +p[2], d = +p[3];
  if ([a, b, c, d].some(x => isNaN(x) || x < 0 || x > 255)) return null;
  return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
}

function parseCIDR(cidr) {
  const [base, bitsStr] = cidr.split('/');
  const bits = parseInt(bitsStr);
  const ipInt = ipToInt(base);
  if (ipInt == null || isNaN(bits)) return null;
  const mask = bits === 0 ? 0 : ((~0 << (32 - bits)) >>> 0);
  return { base: ipInt & mask, mask };
}

// Pre-parse CIDRs for fast lookup
const TRUSTED_CIDR_PARSED = TRUSTED_CIDRS.map(parseCIDR).filter(Boolean);

// ── Public API ───────────────────────────────────────────────────────────────
function isTrustedHost(host) {
  if (!host) return false;
  const h = String(host).toLowerCase().replace(/\.$/, '');
  for (const re of TRUSTED_HOST_PATTERNS) {
    if (re.test(h)) return true;
  }
  return false;
}

function isTrustedIP(ip) {
  const ipInt = ipToInt(ip);
  if (ipInt == null) return false;
  for (const { base, mask } of TRUSTED_CIDR_PARSED) {
    if ((ipInt & mask) === base) return true;
  }
  return false;
}

module.exports = {
  isTrustedHost,
  isTrustedIP,
  ipToInt,
  parseCIDR,
  TRUSTED_HOST_PATTERNS,
  TRUSTED_CIDRS,
};
