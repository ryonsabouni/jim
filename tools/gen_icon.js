// Renders the app icon (gold dumbbell on near-black) to icon-1024.png with zero deps:
// flat colours + axis-aligned rounded rects, hand-encoded PNG via zlib. Downscale the
// output with sips (see README) — edges stay crisp because 1024px hard edges average
// into clean antialiasing at 512/192/180.
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const SIZE = 1024;
const BG = [0x0b, 0x0b, 0x0d];
const GOLD = [0xe5, 0xb8, 0x3d];

// x, y, w, h, corner radius — same geometry as the app's dumbbell glyph,
// kept inside the maskable safe zone (centre ~80%).
const RECTS = [
  [262, 486, 500, 52, 26],   // bar
  [306, 362, 92, 300, 36],   // inner plate L
  [626, 362, 92, 300, 36],   // inner plate R
  [204, 424, 74, 176, 30],   // outer plate L
  [746, 424, 74, 176, 30],   // outer plate R
];

function inRoundRect(px, py, [x, y, w, h, r]) {
  if (px < x || px >= x + w || py < y || py >= y + h) return false;
  const cx = Math.max(x + r, Math.min(px, x + w - r));
  const cy = Math.max(y + r, Math.min(py, y + h - r));
  const dx = px - cx, dy = py - cy;
  return dx * dx + dy * dy <= r * r || (px >= x + r && px < x + w - r) || (py >= y + r && py < y + h - r);
}

// raw scanlines: filter byte 0 + RGB
const raw = Buffer.alloc(SIZE * (1 + SIZE * 3));
for (let y = 0; y < SIZE; y++) {
  const row = y * (1 + SIZE * 3);
  raw[row] = 0;
  for (let x = 0; x < SIZE; x++) {
    const c = RECTS.some(r => inRoundRect(x + 0.5, y + 0.5, r)) ? GOLD : BG;
    const o = row + 1 + x * 3;
    raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2];
  }
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = buf => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
  return out;
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 2;  // colour type: truecolour

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = path.join(__dirname, 'icon-1024.png');
fs.writeFileSync(out, png);
console.log('wrote', out, png.length, 'bytes');
