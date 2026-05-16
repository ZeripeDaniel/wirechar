/**
 * Compact OUI (Organizationally Unique Identifier) lookup.
 * Maps the first 3 bytes of a MAC address to a manufacturer.
 *
 * The official IEEE OUI registry has ~35k entries (~3MB). For wirechar we
 * embed only common consumer/enterprise prefixes — ~150 entries covering
 * the vast majority of home/office traffic. Less common vendors fall back
 * to "Unknown".
 *
 * Format: MAC prefix (no separators, lowercase) → vendor name.
 */

const OUI = {
  // ── Apple ──
  '001451': 'Apple', '0017f2': 'Apple', '0019e3': 'Apple', '001b63': 'Apple',
  '001e52': 'Apple', '001f5b': 'Apple', '002241': 'Apple', '0023df': 'Apple',
  '002500': 'Apple', '00254b': 'Apple', '00264a': 'Apple', '002608': 'Apple',
  '0026b0': 'Apple', '0026bb': 'Apple', '04489a': 'Apple', '04f7e4': 'Apple',
  '101c0c': 'Apple', '14109f': 'Apple', '1cabA7': 'Apple', '1c5cf2': 'Apple',
  '20a2e4': 'Apple', '283737': 'Apple', '28cfda': 'Apple', '34159e': 'Apple',
  '3c0754': 'Apple', '40331a': 'Apple', '40b395': 'Apple', '4c8d79': 'Apple',
  '54e43a': 'Apple', '581faa': 'Apple', '5cf938': 'Apple', '60f81d': 'Apple',
  '683150': 'Apple', '6c4008': 'Apple', '7014a6': 'Apple', '7c6d62': 'Apple',
  '88e9fe': 'Apple', '8c8590': 'Apple', '9810e8': 'Apple', '9c207b': 'Apple',
  'a4d18c': 'Apple', 'a886dd': 'Apple', 'ac3c0b': 'Apple', 'b8782e': 'Apple',
  'bcec5d': 'Apple', 'c869cd': 'Apple', 'd0a637': 'Apple', 'dc2b2a': 'Apple',
  'f0dbf8': 'Apple', 'f4f15a': 'Apple',

  // ── Samsung ──
  '001632': 'Samsung', '001a8a': 'Samsung', '001b98': 'Samsung', '001c43': 'Samsung',
  '001d25': 'Samsung', '001eee': 'Samsung', '00214c': 'Samsung', '0023d6': 'Samsung',
  '002566': 'Samsung', '00265d': 'Samsung', '04180f': 'Samsung', '08373d': 'Samsung',
  '0c1420': 'Samsung', '10683f': 'Samsung', '1816c9': 'Samsung', '20546e': 'Samsung',
  '244b03': 'Samsung', '2cae2b': 'Samsung', '3017c8': 'Samsung', '38aa3c': 'Samsung',
  '5c0a5b': 'Samsung', '5c497d': 'Samsung', '64b853': 'Samsung', '78a873': 'Samsung',
  '8030dc': 'Samsung', '847e40': 'Samsung', '8854cb': 'Samsung', '90f1aa': 'Samsung',
  '9c2a83': 'Samsung', 'a04ee2': 'Samsung', 'ac3613': 'Samsung', 'b407f9': 'Samsung',
  'ccf9e8': 'Samsung', 'cc6b1f': 'Samsung', 'd0667b': 'Samsung', 'e8508b': 'Samsung',
  'f409d8': 'Samsung', 'fc193d': 'Samsung',

  // ── LG ──
  '001e75': 'LG Electronics', '001f6b': 'LG Electronics', '0026e2': 'LG Electronics',
  '344df7': 'LG Electronics', '38ed18': 'LG Electronics', '485929': 'LG Electronics',
  '64bc0c': 'LG Electronics', '7c1c4e': 'LG Electronics', '88c9d0': 'LG Electronics',
  'cc2d8c': 'LG Electronics', 'dc8a3f': 'LG Electronics', 'e8f2e2': 'LG Electronics',

  // ── Microsoft / Surface ──
  '281878': 'Microsoft', '50f37d': 'Microsoft', '60451930': 'Microsoft',
  '6c0b84': 'Microsoft Surface', '7c1e52': 'Microsoft', '98385b': 'Microsoft',
  'c8f733': 'Microsoft', 'e055bd': 'Microsoft',

  // ── Google / Nest / Chromecast ──
  '001a11': 'Google', '6047fa': 'Google', '6c4a85': 'Google', '94eb2c': 'Google',
  'a4778e': 'Google', 'a8c83a': 'Google', 'd83134': 'Google Nest', 'f4f5d8': 'Google',
  'f4f5e8': 'Google', 'f8a9d0': 'Google',

  // ── Sony / PlayStation ──
  '001a80': 'Sony', '0019c5': 'Sony', '0024be': 'Sony', '0d6f6c': 'Sony',
  '5c93a2': 'Sony PlayStation', '70269d': 'Sony', '78843c': 'Sony PlayStation',
  'a8e3ee': 'Sony',

  // ── Nintendo ──
  '0009bf': 'Nintendo', '001656': 'Nintendo', '0017ab': 'Nintendo', '001aec': 'Nintendo',
  '0019fd': 'Nintendo', '001ddc': 'Nintendo', '001fc5': 'Nintendo', '00220a': 'Nintendo',
  '0024f3': 'Nintendo', '04030d': 'Nintendo', '2c10c1': 'Nintendo', '34af2c': 'Nintendo',
  '7048f7': 'Nintendo', '78a2a0': 'Nintendo', '7cbb8a': 'Nintendo', '8c56c5': 'Nintendo',
  '9458cb': 'Nintendo', 'b8ae6e': 'Nintendo', 'e84eCe': 'Nintendo',

  // ── Routers / Networking ──
  '000d3a': 'Microsoft', '001ec2': 'Apple AirPort',
  '00037f': 'Atheros', '001195': 'D-Link', '001346': 'D-Link', '001b11': 'D-Link',
  '0024a5': 'Buffalo', '00904c': 'Epigram', '0014bf': 'Linksys', '0023e9': 'Linksys',
  '001d7e': 'Cisco-Linksys', '482cea': 'Linksys', '001839': 'Cisco-Linksys',
  '6cb0ce': 'Netgear', '94103e': 'Netgear', 'a040a0': 'Netgear', 'e0469a': 'Netgear',
  '74da38': 'EDIMAX', '94d723': 'EDIMAX',
  '001fc6': 'Belkin', '00173f': 'Belkin', '08863b': 'Belkin', '94103e': 'Belkin',
  '00904c': 'Epigram',
  '001d0f': 'TP-Link', '14cc20': 'TP-Link', '1c61b4': 'TP-Link', '60e327': 'TP-Link',
  '989a8f': 'TP-Link', 'a42bb0': 'TP-Link', 'b04e26': 'TP-Link', 'b8a386': 'TP-Link',
  'c46e1f': 'TP-Link', 'c4e90a': 'TP-Link', 'd0374566': 'TP-Link', 'ec086b': 'TP-Link',
  '0019d2': 'ASUS', '001d60': 'ASUS', '04421a': 'ASUS', '107b44': 'ASUS', '1c872c': 'ASUS',
  '54a050': 'ASUS', '7824af': 'ASUS', 'ac220b': 'ASUS', 'd45d64': 'ASUS', 'fc34972': 'ASUS',
  '00177c': 'Aruba', '24deca': 'Aruba', '40e3d6': 'Aruba',
  '0018b9': 'Cisco', '001bd4': 'Cisco', '001ec9': 'Cisco', '0026cb': 'Cisco',
  '5006ab': 'Cisco', '6c5e3b': 'Cisco', 'b4e9b0': 'Cisco', 'd0c789': 'Cisco',
  '24a43c': 'UniFi', '74acb9': 'Ubiquiti', 'fc7c02': 'Ubiquiti', '0418d6': 'Ubiquiti',
  '0c8268': 'Ubiquiti', '24a43c': 'Ubiquiti', '8055f8': 'Ubiquiti', 'dc9fdb': 'Ubiquiti',
  'f09fc2': 'Ubiquiti', 'fcecda': 'Ubiquiti', 'b4fbe4': 'Ubiquiti',
  '34ce00': 'MikroTik', '4c5e0c': 'MikroTik', '64d154': 'MikroTik', '6c3b6b': 'MikroTik',
  'b869f4': 'MikroTik', 'e48d8c': 'MikroTik',

  // ── Korean ISPs / set-top boxes ──
  '5cb43e': 'Samsung Networks', '8421f1': 'Cisco Korea',
  'd84b2a': 'LG U+', '88a73c': 'KT Skylife',

  // ── IoT / Raspberry / Arduino ──
  'b827eb': 'Raspberry Pi', 'dca632': 'Raspberry Pi', 'e45f01': 'Raspberry Pi',
  '28cdc1': 'Raspberry Pi', 'd83add': 'Raspberry Pi',
  '90a2da': 'Arduino', 'a8610a': 'Arduino',
  '5cf370': 'Espressif (ESP32/8266)', '24a160': 'Espressif',
  '24b2de': 'Espressif', '24d7eb': 'Espressif', '3c71bf': 'Espressif',
  '8caab5': 'Espressif', 'a020a6': 'Espressif', 'bcddc2': 'Espressif',

  // ── Virtual machines / containers ──
  '000c29': 'VMware', '001c14': 'VMware', '005056': 'VMware', '080027': 'VirtualBox',
  '00155d': 'Microsoft Hyper-V', '525400': 'QEMU/KVM', '020000': 'Locally Admin',
  '0a002700': 'Docker',

  // ── Printers ──
  '0017a4': 'HP', '0018fe': 'HP', '00306e': 'HP', '94c691': 'HP', 'a0d3c1': 'HP',
  '001321': 'Brother', '001ba9': 'Brother', '4cb16c': 'Brother', '008092': 'Brother',
  '0c8268': 'Brother', '30055c': 'Brother',
  '00248c': 'ASUSTeK', '001599': 'Canon', '7c5cf8': 'Canon', '00cdfe': 'Canon',
  '0030c1': 'Epson', '001e0d': 'Epson', '38d547': 'Epson', '64eb8c': 'Epson',
  '6c2779': 'Epson',

  // ── Smart home / IoT brands ──
  '500ff5': 'Xiaomi', '54ea28': 'Xiaomi', '649ddf': 'Xiaomi', '78110f': 'Xiaomi',
  '7c1dd9': 'Xiaomi', '8cbeBe': 'Xiaomi', 'ec55f9': 'Xiaomi', 'f81a67': 'Xiaomi',
  'fcec01': 'Xiaomi',
  '00fc8b': 'Amazon (Echo/Kindle)', '0c47c9': 'Amazon', '34d270': 'Amazon',
  '40b4cd': 'Amazon', '44650d': 'Amazon', '50f5da': 'Amazon', '50dcE7': 'Amazon',
  '50f5da': 'Amazon', '74c246': 'Amazon', '847b57': 'Amazon', 'a002dc': 'Amazon',
  'ac63be': 'Amazon', 'b052d6': 'Amazon', 'b47c9c': 'Amazon', 'cc9ea2': 'Amazon',
  'f0d2f1': 'Amazon', 'f0f4c7': 'Amazon', 'fcaff7': 'Amazon',
  '286046': 'Lutron', '0090a9': 'Western Digital', '00224d': 'iPhone Devices',
};

// Build vendor → icon map for known categories
const VENDOR_ICONS = {
  Apple: '🍎', 'Apple AirPort': '📡',
  Samsung: '📱', 'Samsung Networks': '📡',
  'LG Electronics': '📺',
  Microsoft: '🪟', 'Microsoft Surface': '💻', 'Microsoft Hyper-V': '🖥️',
  Google: '🌐', 'Google Nest': '🏠',
  Sony: '🎮', 'Sony PlayStation': '🎮',
  Nintendo: '🎮',
  Cisco: '📡', 'Cisco-Linksys': '📡', 'Cisco Korea': '📡',
  'D-Link': '📡', 'TP-Link': '📡', Netgear: '📡', Linksys: '📡', Belkin: '📡',
  ASUS: '💻', Aruba: '📡', UniFi: '📡', Ubiquiti: '📡', MikroTik: '📡',
  'Raspberry Pi': '🍓',
  Arduino: '🔌',
  'Espressif (ESP32/8266)': '🔌', Espressif: '🔌',
  VMware: '🖥️', VirtualBox: '🖥️', 'QEMU/KVM': '🖥️', Docker: '🐳',
  HP: '🖨️', Brother: '🖨️', Canon: '🖨️', Epson: '🖨️',
  Xiaomi: '📱',
  'Amazon (Echo/Kindle)': '🛒', Amazon: '🛒',
  Lutron: '💡',
  'Western Digital': '💾',
  'LG U+': '📡', 'KT Skylife': '📡',
};

/** Look up vendor name by MAC address. Returns null if unknown. */
export function lookupVendor(mac) {
  if (!mac) return null;
  const clean = mac.replace(/[^0-9a-fA-F]/g, '').toLowerCase();
  if (clean.length < 6) return null;
  const prefix = clean.slice(0, 6);
  return OUI[prefix] || null;
}

/** Pick an emoji icon for a vendor name. */
export function iconForVendor(vendor) {
  if (!vendor) return '🔌';
  return VENDOR_ICONS[vendor] || '🔌';
}

/** Is this a locally-administered (random/virtualized) MAC? */
export function isLocallyAdministered(mac) {
  if (!mac) return false;
  const clean = mac.replace(/[^0-9a-fA-F]/g, '').toLowerCase();
  if (clean.length < 2) return false;
  const firstByte = parseInt(clean.slice(0, 2), 16);
  return (firstByte & 0x02) !== 0;
}

/** Multicast / broadcast MAC? Skip these from device list. */
export function isMulticast(mac) {
  if (!mac) return true;
  if (mac.toLowerCase() === 'ff:ff:ff:ff:ff:ff') return true;
  const clean = mac.replace(/[^0-9a-fA-F]/g, '').toLowerCase();
  if (clean.length < 2) return true;
  const firstByte = parseInt(clean.slice(0, 2), 16);
  return (firstByte & 0x01) !== 0;   // LSB of first byte = multicast bit
}
