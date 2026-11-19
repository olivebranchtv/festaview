// Generates simple brand images (no outside tools): the social share image and logo.
// Replace public/og-default.png and public/logo-512.png with branded artwork (with the Festaview name) when you have it.
import fs from 'node:fs'
import zlib from 'node:zlib'

const crcTable = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
const chunk = (type, data) => { const t = Buffer.from(type); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, crc]) }
function png(w, h, px) {
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

const BG = [11, 11, 18], GOLD = [230, 179, 74], DARK = [26, 20, 5], PANEL = [27, 27, 43], LINE = [42, 42, 64]
function canvas(w, h, bg) {
  const px = Buffer.alloc(w * h * 4)
  for (let i = 0; i < w * h; i++) { px[i * 4] = bg[0]; px[i * 4 + 1] = bg[1]; px[i * 4 + 2] = bg[2]; px[i * 4 + 3] = 255 }
  const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < w && y < h) { const i = (y * w + x) * 4; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2] } }
  const roundRect = (x0, y0, rw, rh, r, c) => { for (let y = y0; y < y0 + rh; y++) for (let x = x0; x < x0 + rw; x++) { const cx = x < x0 + r ? x0 + r : x >= x0 + rw - r ? x0 + rw - r - 1 : x; const cy = y < y0 + r ? y0 + r : y >= y0 + rh - r ? y0 + rh - r - 1 : y; if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) set(x, y, c) } }
  const triangle = (ax, ay, bx, by, cx, cy, c) => { const minX = Math.min(ax, bx, cx), maxX = Math.max(ax, bx, cx), minY = Math.min(ay, by, cy), maxY = Math.max(ay, by, cy); const s = (px1, py1, px2, py2, px3, py3) => (px1 - px3) * (py2 - py3) - (px2 - px3) * (py1 - py3); for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) { const d1 = s(x, y, ax, ay, bx, by), d2 = s(x, y, bx, by, cx, cy), d3 = s(x, y, cx, cy, ax, ay); if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) set(x, y, c) } }
  return { px, roundRect, triangle }
}
function mark(c, x, y, size) { c.roundRect(x, y, size, size, Math.round(size * 0.28), GOLD); const t = size * 0.34; c.triangle(Math.round(x + size * 0.38), Math.round(y + size * 0.25), Math.round(x + size * 0.38), Math.round(y + size * 0.75), Math.round(x + size * 0.38 + t * 1.2), Math.round(y + size * 0.5), DARK) }

// 1200 x 630 social share image: logo mark and a stylised festival "TV guide"
{
  const c = canvas(1200, 630, BG)
  c.roundRect(60, 60, 1080, 510, 28, PANEL)
  mark(c, 130, 215, 200)
  for (let i = 0; i < 4; i++) { c.roundRect(400, 150 + i * 92, 640, 64, 14, LINE); c.roundRect(400, 150 + i * 92, 120 + ((i * 97) % 3) * 80, 64, 14, GOLD) }
  fs.writeFileSync(new URL('../public/og-default.png', import.meta.url), png(1200, 630, c.px))
}
// 512 x 512 logo
{
  const c = canvas(512, 512, BG)
  mark(c, 96, 96, 320)
  fs.writeFileSync(new URL('../public/logo-512.png', import.meta.url), png(512, 512, c.px))
}
// 180 x 180 apple touch icon
{
  const c = canvas(180, 180, BG)
  mark(c, 30, 30, 120)
  fs.writeFileSync(new URL('../public/apple-touch-icon.png', import.meta.url), png(180, 180, c.px))
}
console.log('brand images written to public/')
