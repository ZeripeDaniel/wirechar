/**
 * Heuristic traffic classifier. Returns { tag, icon, labelKey, extra? }.
 * `labelKey` is an i18n key resolved by i18n.t().
 * `extra` is appended to the translated label (e.g. host name for DNS).
 *
 * No AI — pure pattern matching on hosts, ports, HTTP/TLS metadata, TCP flags,
 * and packet size.
 */

const HOST_RULES = [
  // [regex, tag, labelKey, icon]
  [/google\.com|googleapis|gstatic/,                'web-search', 'cls_web_search_google', '🔍'],
  [/duckduckgo|bing\.com|search\.brave/,            'web-search', 'cls_web_search',        '🔍'],
  [/youtube|youtu\.be|googlevideo/,                 'video',      'cls_youtube',           '📺'],
  [/netflix|nflxvideo|nflximg/,                     'video',      'cls_netflix',           '📺'],
  [/twitch\.tv|ttvnw/,                              'video',      'cls_twitch',            '🎮'],
  [/vimeo|dailymotion/,                             'video',      'cls_video',             '📺'],
  [/spotify|scdn\.co|soundcloud/,                   'audio',      'cls_audio',             '🎵'],
  [/apple\.music|music\.apple/,                     'audio',      'cls_audio',             '🎵'],
  [/discord(app)?\.com|discord\.gg/,                'chat',       'cls_discord',           '💬'],
  [/telegram\.org|t\.me|telegra\.ph/,               'chat',       'cls_telegram',          '💬'],
  [/whatsapp|wa\.me/,                               'chat',       'cls_whatsapp',          '💬'],
  [/signal\.org/,                                   'chat',       'cls_signal',            '💬'],
  [/slack\.com|slackb/,                             'chat',       'cls_slack',             '💬'],
  [/kakao\.com|kakaocdn/,                           'chat',       'cls_kakao',             '💬'],
  [/(^|\.)naver\.com|pstatic\.net/,                 'web',        'cls_naver',             '🌐'],
  [/(^|\.)daum\.net|kakao\.com\/(?!chat)/,          'web',        'cls_daum',              '🌐'],
  [/github\.com|githubusercontent|githubassets/,    'code',       'cls_github',            '💻'],
  [/gitlab|bitbucket/,                              'code',       'cls_code_repo',         '💻'],
  [/cloudflare|fastly|akamai|cloudfront|edgekey/,   'cdn',        'cls_cdn',               '☁️'],
  [/microsoft\.com|live\.com|office\.com/,          'microsoft',  'cls_microsoft',         '🪟'],
  [/windowsupdate|update\.microsoft|msftncsi/,      'update',     'cls_update',            '🔄'],
  [/apple\.com|icloud|mzstatic/,                    'apple',      'cls_apple',             '🍎'],
  [/steam(community|powered|static)|valvesoftware/, 'game',       'cls_steam',             '🎮'],
  [/epicgames|unrealengine/,                        'game',       'cls_epic',              '🎮'],
  [/battle\.net|blizzard/,                          'game',       'cls_battle_net',        '🎮'],
  [/riotgames|leagueoflegends/,                     'game',       'cls_riot',              '🎮'],
  [/mihoyo|hoyoverse/,                              'game',       'cls_hoyo',              '🎮'],
  [/nexon|maplestory/,                              'game',       'cls_nexon',             '🎮'],
  [/zoom\.us|zoomgov/,                              'meeting',    'cls_zoom',              '🎥'],
  [/teams\.microsoft|webex\.com|meet\.google/,      'meeting',    'cls_meeting',           '🎥'],
  [/dropbox|box\.com/,                              'cloud',      'cls_cloud',             '☁️'],
  [/onedrive|sharepoint|1drv/,                      'cloud',      'cls_onedrive',          '☁️'],
  [/drive\.google|docs\.google/,                    'cloud',      'cls_gdrive',            '☁️'],
  [/openai\.com|chatgpt\.com|anthropic|claude\.ai/, 'ai',         'cls_ai',                '🤖'],
  [/coupang|aliexpress|amazon\.com|ebay/,           'shopping',   'cls_shopping',          '🛒'],
  [/paypal|toss\.im|kakaopay/,                      'payment',    'cls_payment',           '💳'],
  [/doubleclick|google-analytics|googletagmanager|facebook\.net\/tr/, 'tracker', 'cls_tracker', '📊'],
  [/twitter\.com|x\.com|twimg/,                     'social',     'cls_twitter',           '🐦'],
  [/facebook\.com|fbcdn/,                           'social',     'cls_facebook',          '👥'],
  [/instagram|cdninstagram/,                        'social',     'cls_instagram',         '📷'],
  [/reddit\.com|redditmedia/,                       'social',     'cls_reddit',            '👽'],
];

const PORT_RULES = {
  21:    { tag: 'ftp',         labelKey: 'cls_ftp',         icon: '📁' },
  22:    { tag: 'ssh',         labelKey: 'cls_ssh',         icon: '🔐' },
  23:    { tag: 'telnet',      labelKey: 'cls_telnet',      icon: '⌨️' },
  25:    { tag: 'email-send',  labelKey: 'cls_smtp',        icon: '📧' },
  53:    { tag: 'dns',         labelKey: 'cls_dns',         icon: '🔎' },
  67:    { tag: 'dhcp',        labelKey: 'cls_dhcp',        icon: '🌐' },
  68:    { tag: 'dhcp',        labelKey: 'cls_dhcp',        icon: '🌐' },
  80:    { tag: 'http',        labelKey: 'cls_http',        icon: '🌐' },
  110:   { tag: 'email-recv',  labelKey: 'cls_pop3',        icon: '📧' },
  123:   { tag: 'ntp',         labelKey: 'cls_ntp',         icon: '🕐' },
  137:   { tag: 'netbios',     labelKey: 'cls_netbios',     icon: '🪟' },
  138:   { tag: 'netbios',     labelKey: 'cls_netbios_dgm', icon: '🪟' },
  139:   { tag: 'smb',         labelKey: 'cls_smb',         icon: '📂' },
  143:   { tag: 'email-recv',  labelKey: 'cls_imap',        icon: '📧' },
  161:   { tag: 'snmp',        labelKey: 'cls_snmp',        icon: '📡' },
  389:   { tag: 'ldap',        labelKey: 'cls_ldap',        icon: '📇' },
  443:   { tag: 'https',       labelKey: 'cls_https',       icon: '🔒' },
  445:   { tag: 'smb',         labelKey: 'cls_smb',         icon: '📂' },
  465:   { tag: 'email-send',  labelKey: 'cls_smtps',       icon: '📧' },
  514:   { tag: 'syslog',      labelKey: 'cls_syslog',      icon: '📜' },
  587:   { tag: 'email-send',  labelKey: 'cls_smtp_587',    icon: '📧' },
  636:   { tag: 'ldap',        labelKey: 'cls_ldaps',       icon: '📇' },
  993:   { tag: 'email-recv',  labelKey: 'cls_imaps',       icon: '📧' },
  995:   { tag: 'email-recv',  labelKey: 'cls_pop3s',       icon: '📧' },
  1194:  { tag: 'vpn',         labelKey: 'cls_vpn_openvpn', icon: '🔒' },
  1433:  { tag: 'db',          labelKey: 'cls_db_mssql',    icon: '🗄️' },
  1521:  { tag: 'db',          labelKey: 'cls_db_oracle',   icon: '🗄️' },
  1900:  { tag: 'ssdp',        labelKey: 'cls_ssdp',        icon: '📺' },
  1935:  { tag: 'stream',      labelKey: 'cls_rtmp',        icon: '📡' },
  2049:  { tag: 'nfs',         labelKey: 'cls_nfs',         icon: '📂' },
  3306:  { tag: 'db',          labelKey: 'cls_db_mysql',    icon: '🗄️' },
  3389:  { tag: 'rdp',         labelKey: 'cls_rdp',         icon: '🖥️' },
  5060:  { tag: 'voip',        labelKey: 'cls_voip_sip',    icon: '📞' },
  5061:  { tag: 'voip',        labelKey: 'cls_voip_sips',   icon: '📞' },
  5222:  { tag: 'chat',        labelKey: 'cls_xmpp',        icon: '💬' },
  5353:  { tag: 'mdns',        labelKey: 'cls_mdns',        icon: '🔎' },
  5432:  { tag: 'db',          labelKey: 'cls_db_postgres', icon: '🗄️' },
  5900:  { tag: 'vnc',         labelKey: 'cls_vnc',         icon: '🖥️' },
  6379:  { tag: 'db',          labelKey: 'cls_db_redis',    icon: '🗄️' },
  8080:  { tag: 'http',        labelKey: 'cls_http_alt',    icon: '🌐' },
  8443:  { tag: 'https',       labelKey: 'cls_https_alt',   icon: '🔒' },
  27017: { tag: 'db',          labelKey: 'cls_db_mongo',    icon: '🗄️' },
  51820: { tag: 'vpn',         labelKey: 'cls_vpn_wg',      icon: '🔒' },
};

export function classifyPacket(pkt) {
  // 1) Host-based rules
  if (pkt.host) {
    const h = pkt.host.toLowerCase();
    for (const [re, tag, labelKey, icon] of HOST_RULES) {
      if (re.test(h)) return { tag, labelKey, icon };
    }
  }

  // 2) HTTP semantics
  if (pkt.httpMethod || pkt.httpStatus) {
    if (pkt.httpUri && /search|query|q=/i.test(pkt.httpUri))
      return { tag: 'web-search', labelKey: 'cls_web_search', icon: '🔍' };
    if (pkt.httpMethod === 'POST')
      return { tag: 'web-post', labelKey: 'cls_web_post', icon: '📤' };
    if (pkt.httpMethod === 'GET')
      return { tag: 'web-get', labelKey: 'cls_web_get', icon: '🌐' };
    if (pkt.httpStatus) {
      const code = parseInt(pkt.httpStatus);
      if (code >= 200 && code < 300) return { tag: 'web-ok',  labelKey: 'cls_web_ok',  icon: '✅', extra: `(${code})` };
      if (code >= 400 && code < 500) return { tag: 'web-err', labelKey: 'cls_web_err', icon: '⚠️', extra: `(${code})` };
      if (code >= 500)               return { tag: 'web-err', labelKey: 'cls_server_err', icon: '🔥', extra: `(${code})` };
    }
  }

  // 3) DNS
  if (pkt.protocol === 'DNS' || pkt.dnsName) {
    return { tag: 'dns', labelKey: 'cls_dns_query', icon: '🔎', extra: pkt.dnsName || '-' };
  }

  // 4) TLS hints
  if (pkt.tlsHsType === '1') return { tag: 'tls-hello', labelKey: 'cls_tls_hello', icon: '🤝' };
  if (pkt.sni)               return { tag: 'tls-data',  labelKey: 'cls_tls_data',  icon: '🔒', extra: `(${pkt.sni})` };

  // 5) Port-based
  const port = pkt.tcpDstPort || pkt.udpDstPort || 0;
  const srcPort = pkt.tcpSrcPort || pkt.udpSrcPort || 0;
  const knownPort = PORT_RULES[port] || PORT_RULES[srcPort];
  if (knownPort) return { ...knownPort };

  // 6) TCP flags (connection lifecycle)
  if (pkt.tcpFlags) {
    if (pkt.tcpFlags === 'SYN')          return { tag: 'connect', labelKey: 'cls_connect', icon: '🤝' };
    if (pkt.tcpFlags.includes('FIN'))    return { tag: 'close',   labelKey: 'cls_close',   icon: '👋' };
    if (pkt.tcpFlags.includes('RST'))    return { tag: 'reset',   labelKey: 'cls_reset',   icon: '⚠️' };
  }

  // 7) ICMP
  if (pkt.protocol === 'ICMP') return { tag: 'ping', labelKey: 'cls_ping', icon: '🏓' };

  // 8) Size-based fallback
  if (pkt.size > 1300 && pkt.direction === 'in')  return { tag: 'download', labelKey: 'cls_download', icon: '⬇️' };
  if (pkt.size > 1300 && pkt.direction === 'out') return { tag: 'upload',   labelKey: 'cls_upload',   icon: '⬆️' };

  // 9) Default
  return {
    tag: 'data',
    labelKey: pkt.protocol === 'UDP' ? 'cls_udp_packet' : 'cls_data',
    icon: '📦',
  };
}

/**
 * Byte-pattern analyzer. Returns { labelKey, evidence } or null.
 */
export function analyzeBytes(hexDump) {
  if (!hexDump) return null;
  const firstLines = hexDump.split('\n').slice(0, 6);

  const bytes = [];
  for (const line of firstLines) {
    const m = line.match(/^[0-9a-f]+\s{2,}([0-9a-f ]+?)\s{2,}/i);
    if (!m) continue;
    for (const tok of m[1].split(/\s+/)) {
      if (/^[0-9a-f]{2}$/i.test(tok)) bytes.push(parseInt(tok, 16));
    }
    if (bytes.length >= 96) break;
  }
  if (bytes.length === 0) return null;

  const ascii = bytes.slice(0, 16).map(b => (b >= 0x20 && b < 0x7f) ? String.fromCharCode(b) : '.').join('');

  const asciiTests = [
    [/^GET /,     'byte_http_get'],
    [/^POST /,    'byte_http_post'],
    [/^PUT /,     'byte_http_put'],
    [/^DELETE /,  'byte_http_delete'],
    [/^HEAD /,    'byte_http_head'],
    [/^OPTIONS /, 'byte_http_options'],
    [/^HTTP\/1/,  'byte_http_response'],
    [/^SSH-/,     'byte_ssh_banner'],
    [/^USER /,    'byte_ftp_user'],
    [/^PASS /,    'byte_ftp_pass'],
    [/^EHLO|^HELO/, 'byte_smtp_helo'],
    [/^MAIL FROM/, 'byte_smtp_from'],
    [/^RCPT TO/,  'byte_smtp_to'],
    [/^STARTTLS/, 'byte_starttls'],
    [/^a[0-9]+ /, 'byte_imap'],
  ];
  for (const [re, key] of asciiTests) {
    if (re.test(ascii)) return { labelKey: key, evidence: ascii.replace(/\.+$/, '') };
  }

  const sig = (idx, ...arr) => arr.every((b, i) => bytes[idx + i] === b);

  if (sig(0, 0x16, 0x03)) {
    const types = { 0x01: 'byte_tls_hs_client', 0x02: 'byte_tls_hs_server', 0x0b: 'byte_tls_hs_cert', 0x10: 'byte_tls_hs_keyex', 0x14: 'byte_tls_hs_finished' };
    const ht = bytes[5];
    return { labelKey: types[ht] || 'byte_tls_hs', evidence: `0x16 03 ... ${ht?.toString(16)}` };
  }
  if (sig(0, 0x17, 0x03)) return { labelKey: 'byte_tls_app',    evidence: '0x17 03 ...' };
  if (sig(0, 0x15, 0x03)) return { labelKey: 'byte_tls_alert',  evidence: '0x15 03 ...' };
  if (sig(0, 0x14, 0x03)) return { labelKey: 'byte_tls_cipher', evidence: '0x14 03 ...' };

  if (sig(0, 0x89, 0x50, 0x4e, 0x47)) return { labelKey: 'byte_file_png',  evidence: 'PNG magic' };
  if (sig(0, 0xff, 0xd8, 0xff))       return { labelKey: 'byte_file_jpeg', evidence: 'JPEG magic' };
  if (sig(0, 0x47, 0x49, 0x46, 0x38)) return { labelKey: 'byte_file_gif',  evidence: 'GIF magic' };
  if (sig(0, 0x50, 0x4b, 0x03, 0x04)) return { labelKey: 'byte_file_zip',  evidence: 'PK\\x03\\x04' };
  if (sig(0, 0x25, 0x50, 0x44, 0x46)) return { labelKey: 'byte_file_pdf',  evidence: '%PDF' };
  if (sig(0, 0x4d, 0x5a))             return { labelKey: 'byte_file_exe',  evidence: 'MZ magic' };
  if (sig(0, 0x7f, 0x45, 0x4c, 0x46)) return { labelKey: 'byte_file_elf',  evidence: 'ELF magic' };
  if (sig(0, 0x1f, 0x8b))             return { labelKey: 'byte_file_gzip', evidence: '1f 8b' };
  if (sig(0, 0x42, 0x5a, 0x68))       return { labelKey: 'byte_file_bzip2', evidence: 'BZh' };
  if (sig(4, 0x66, 0x74, 0x79, 0x70)) return { labelKey: 'byte_file_mp4',  evidence: 'ftyp box' };

  if ((bytes[0] >> 6) === 2 && bytes[1] >= 0x60 && bytes[1] <= 0x7f) {
    return { labelKey: 'byte_rtp', evidence: 'RTP v2' };
  }

  if ((bytes[0] & 0x80) === 0 && (bytes[0] & 0x40) === 0x40) {
    return { labelKey: 'byte_quic_short', evidence: 'QUIC short header' };
  }
  if ((bytes[0] & 0xc0) === 0xc0) {
    return { labelKey: 'byte_quic_long', evidence: 'QUIC long header' };
  }

  return null;
}
