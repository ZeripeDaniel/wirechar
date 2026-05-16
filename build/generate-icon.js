/**
 * Generate Windows app/tray icons from the wirechar character pixel art.
 * No external dependencies — emits PNG + ICO using built-in zlib.
 *
 * Output:
 *   build/icons/wirechar.ico       multi-size Windows app icon (16/32/48/64/128/256)
 *   build/icons/icon-256.png       large source PNG (for web/docs)
 *   build/icons/tray-16.png        runtime tray icon (1×)
 *   build/icons/tray-32.png        runtime tray icon (2× — HiDPI)
 *
 * Sources the pixel data inline (one frame, idle[0]). If the character art
 * changes in renderer/character.js, copy the new frame here.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ─── Source pixel art (copy of FRAMES.idle[0] from renderer/character.js) ───
// 16 cols × 24 rows. Each char maps to a palette entry below.
const IDLE = [
  '____hHHHHHh_____',
  '___hHHHHHHHh____',
  '__khHssssssHhk__',
  '__khHsweswsHhk__',
  '__khHsweswsHhk__',
  '__khHssssssSHk__',
  '__khHssMssssHk__',
  '__khHssssssHhk__',
  '___kSSSSSSSkk___',
  '____ssssss______',
  '___kTTTTTTTk____',
  '__kTBBBBBBBTk___',
  '_ksTBBbBBBBTsk__',
  '_ksTBBBBBBBTsk__',
  '_ksTBTTTTTBTsk__',
  '__kTTTTTTTTTk___',
  '___kTTgggTTk____',
  '___kPPPPPPPk____',
  '___kPPkkkPPk____',
  '___kPP___PPk____',
  '___kPP___PPk____',
  '__koPP___PPoK___',
  '__koOO___OOok___',
  '__koOOk_kOOok___',
];

const PALETTE = {
  k: '#0d0d12', h: '#2a1800', H: '#5c3010',
  s: '#f5c888', S: '#d4a060',
  e: '#080820', w: '#fffef5',
  t: '#0d4fa0', T: '#1a6ccc', B: '#2288ee', b: '#8cc8ff',
  p: '#151830', P: '#20254a',
  o: '#0a0a10', O: '#1e1e2e',
  g: '#3a3a5a',
  M: '#c06040', K: '#1a1a2a',
};

// ─── Bitmap rendering ───────────────────────────────────────────────────────
function hexToRGB(s) {
  return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
}

/**
 * Render the character into a `size×size` RGBA buffer.
 * Source is 16×24 — for square icons we crop to 16×16 (head + shoulders)
 * and scale up by integer factors only (preserves pixel-art crispness).
 */
function renderRGBA(size) {
  // Crop source to a 16×16 square: head, neck, top of shirt
  const SRC_W = 16, SRC_H = 16;
  const src = IDLE.slice(0, SRC_H);

  // Integer scale that fits the target size exactly (size must be a multiple of 16)
  const scale = Math.max(1, Math.floor(size / SRC_W));
  const drawW = SRC_W * scale;
  const drawH = SRC_H * scale;

  // Center the drawn block within size×size (in case size isn't a clean multiple)
  const offX = Math.floor((size - drawW) / 2);
  const offY = Math.floor((size - drawH) / 2);

  const buf = Buffer.alloc(size * size * 4); // RGBA, all zeros = transparent

  for (let r = 0; r < SRC_H; r++) {
    for (let c = 0; c < SRC_W; c++) {
      const ch = src[r][c];
      const col = PALETTE[ch];
      if (!col) continue; // transparent
      const [R, G, B] = hexToRGB(col);
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const x = offX + c * scale + dx;
          const y = offY + r * scale + dy;
          if (x < 0 || x >= size || y < 0 || y >= size) continue;
          const off = (y * size + x) * 4;
          buf[off]     = R;
          buf[off + 1] = G;
          buf[off + 2] = B;
          buf[off + 3] = 255;
        }
      }
    }
  }
  return buf;
}

// ─── PNG encoder (RGBA only) ────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function pngEncode(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width,  0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8]  = 8;   // bit depth
  ihdr[9]  = 6;   // color type 6 = RGBA
  ihdr[10] = 0;   // compression
  ihdr[11] = 0;   // filter
  ihdr[12] = 0;   // interlace

  // Raw scanlines with filter byte 0 (none) prepended
  const scanline = width * 4;
  const raw = Buffer.alloc(height * (scanline + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (scanline + 1)] = 0;
    rgba.copy(raw, y * (scanline + 1) + 1, y * scanline, (y + 1) * scanline);
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ─── ICO encoder (containing PNG-compressed entries; Vista+) ────────────────
function icoEncode(images) {
  const N = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);  // reserved
  header.writeUInt16LE(1, 2);  // type 1 = icon
  header.writeUInt16LE(N, 4);  // image count

  const entries = Buffer.alloc(16 * N);
  let offset = 6 + 16 * N;
  for (let i = 0; i < N; i++) {
    const img = images[i];
    const base = i * 16;
    entries[base]     = img.width  >= 256 ? 0 : img.width;
    entries[base + 1] = img.height >= 256 ? 0 : img.height;
    entries[base + 2] = 0;            // palette count
    entries[base + 3] = 0;            // reserved
    entries.writeUInt16LE(1,  base + 4);   // color planes
    entries.writeUInt16LE(32, base + 6);   // bits per pixel
    entries.writeUInt32LE(img.png.length, base + 8);
    entries.writeUInt32LE(offset, base + 12);
    offset += img.png.length;
  }

  return Buffer.concat([header, entries, ...images.map(i => i.png)]);
}

// ─── Main ───────────────────────────────────────────────────────────────────
const OUT_DIR = path.join(__dirname, 'icons');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const SIZES = [16, 32, 48, 64, 128, 256];

console.log('[icon] Rendering character pixel art…');
const images = SIZES.map(size => {
  const rgba = renderRGBA(size);
  const png = pngEncode(size, size, rgba);
  return { width: size, height: size, png };
});

// Multi-size .ico for the Windows app icon (used by electron-builder)
const ico = icoEncode(images);
fs.writeFileSync(path.join(OUT_DIR, 'wirechar.ico'), ico);
console.log(`[icon] wirechar.ico  ${(ico.length / 1024).toFixed(1)} KB  (${SIZES.join('/')} multi-size)`);

// Standalone PNGs for the runtime tray icon (different DPI scaling)
for (const img of images) {
  const name = (img.width === 16 || img.width === 32) ? `tray-${img.width}.png` : `icon-${img.width}.png`;
  fs.writeFileSync(path.join(OUT_DIR, name), img.png);
}
console.log(`[icon] tray-16.png + tray-32.png + icon-{48..256}.png written to ${OUT_DIR}`);
