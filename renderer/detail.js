/**
 * Wireshark-like packet detail panel.
 * Renders structured layer tree from the packet object using i18n labels.
 */
import { t } from './i18n.js';

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function makeLayer(title, fields) {
  const layer = document.createElement('div');
  layer.className = 'layer';

  const header = document.createElement('div');
  header.className = 'layer-header';
  header.innerHTML = `<span class="caret">▼</span> ${escapeHtml(title)}`;
  layer.appendChild(header);

  const body = document.createElement('div');
  body.className = 'layer-body';
  for (const [k, v] of fields) {
    if (v == null || v === '') continue;
    const row = document.createElement('div');
    row.className = 'field';
    const key = document.createElement('span');
    key.className = 'field-key';
    key.textContent = k;
    const val = document.createElement('span');
    val.className = 'field-val';
    val.textContent = String(v);
    row.appendChild(key);
    row.appendChild(val);
    body.appendChild(row);
  }
  layer.appendChild(body);

  header.addEventListener('click', () => {
    const collapsed = layer.classList.toggle('collapsed');
    header.querySelector('.caret').textContent = collapsed ? '▶' : '▼';
  });

  return layer;
}

export function renderDetailPanel(p) {
  const root = document.createDocumentFragment();

  // ── User-friendly classification banner ──
  if (p._class) {
    const banner = document.createElement('div');
    banner.className = 'detail-banner';
    const label = t(p._class.labelKey) + (p._class.extra ? ' ' + p._class.extra : '');
    banner.innerHTML = `
      <span class="banner-icon">${p._class.icon}</span>
      <div class="banner-text">
        <div class="banner-label">${escapeHtml(label)}</div>
        <div class="banner-detail">${escapeHtml(p.host || (p.direction === 'in' ? p.src : p.dst) || '')}
          ${p._class.tag ? `<span class="banner-tag">${escapeHtml(p._class.tag)}</span>` : ''}</div>
      </div>`;
    root.appendChild(banner);
  }

  // ── Frame ──
  root.appendChild(makeLayer(t('layer_frame'), [
    [t('f_number'),    p.frame],
    [t('f_time'),      new Date(p.time).toLocaleString()],
    [t('f_length'),    `${p.size} bytes`],
    [t('f_direction'), p.direction === 'in' ? t('dir_in') : t('dir_out')],
    [t('f_protocol'),  p.protocol],
    [t('f_info'),      p.info],
  ]));

  // ── Ethernet (L2) ──
  if (p.ethSrc || p.ethDst) {
    root.appendChild(makeLayer(t('layer_ethernet'), [
      [t('f_src_mac'), p.ethSrc],
      [t('f_dst_mac'), p.ethDst],
    ]));
  }

  // ── IPv4 (L3) ──
  root.appendChild(makeLayer(t('layer_ipv4'), [
    [t('f_source'),      p.src],
    [t('f_destination'), p.dst],
    [t('f_ttl'),         p.ipTtl],
    [t('f_protocol'),    ipProtoName(p.ipProto)],
  ]));

  // ── TCP (L4) ──
  if (p.tcpSrcPort || p.tcpDstPort) {
    root.appendChild(makeLayer(t('layer_tcp'), [
      [t('f_src_port'), p.tcpSrcPort],
      [t('f_dst_port'), p.tcpDstPort],
      [t('f_seq'),      p.tcpSeq],
      [t('f_ack'),      p.tcpAck],
      [t('f_flags'),    p.tcpFlags],
      [t('f_window'),   p.tcpWindow],
    ]));
  }

  // ── UDP (L4) ──
  if (p.udpSrcPort || p.udpDstPort) {
    root.appendChild(makeLayer(t('layer_udp'), [
      [t('f_src_port'), p.udpSrcPort],
      [t('f_dst_port'), p.udpDstPort],
    ]));
  }

  // ── DNS ──
  if (p.dnsName || p.dnsA || p.dnsAAAA || p.dnsCname) {
    root.appendChild(makeLayer(t('layer_dns'), [
      [t('f_query_name'),   p.dnsName],
      [t('f_query_type'),   p.dnsQType],
      [t('f_answer_a'),     p.dnsA],
      [t('f_answer_aaaa'),  p.dnsAAAA],
      [t('f_answer_cname'), p.dnsCname],
    ]));
  }

  // ── HTTP ──
  if (p.httpHost || p.httpMethod || p.httpStatus) {
    root.appendChild(makeLayer(t('layer_http'), [
      [t('f_host'),       p.httpHost],
      [t('f_method'),     p.httpMethod],
      [t('f_uri'),        p.httpUri],
      [t('f_status'),     p.httpStatus],
      [t('f_phrase'),     p.httpPhrase],
      [t('f_user_agent'), p.userAgent],
    ]));
  }

  // ── TLS ──
  if (p.sni || p.tlsVersion) {
    root.appendChild(makeLayer(t('layer_tls'), [
      [t('f_sni'),            p.sni],
      [t('f_tls_version'),    p.tlsVersion],
      [t('f_handshake_type'), tlsHandshakeType(p.tlsHsType)],
    ]));
  }

  return root;
}

function ipProtoName(n) {
  if (n == null) return null;
  const map = { 1: 'ICMP (1)', 6: 'TCP (6)', 17: 'UDP (17)', 41: 'IPv6 (41)', 58: 'ICMPv6 (58)' };
  return map[n] || `Unknown (${n})`;
}

function tlsHandshakeType(ty) {
  if (ty == null) return null;
  const map = {
    '1': 'Client Hello',
    '2': 'Server Hello',
    '11': 'Certificate',
    '12': 'Server Key Exchange',
    '14': 'Server Hello Done',
    '16': 'Client Key Exchange',
    '20': 'Finished',
  };
  return map[String(ty)] || `Type ${ty}`;
}
