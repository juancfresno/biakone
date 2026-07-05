import { promises as fs } from 'node:fs'
import sharp from 'sharp'
import path from 'node:path'

const ROOT = '/Users/juancfresno/Documents/Fresno Studio/products/web/biakone'
const PUB = path.join(ROOT, 'public')
const CREAM = '#FFFFE6'
const DARK = '#141414'

// wordmark path (from public/biako-wordmark.svg, viewBox 0 0 61 24)
const src = await fs.readFile(path.join(PUB, 'biako-wordmark.svg'), 'utf8')
const D = src.match(/d="([^"]+)"/)[1]

// Fit a bbox {x,y,w,h} (wordmark coords) into a `size` square with `pad`, centred.
function place (size, bbox, pad) {
  const avail = size - 2 * pad
  const s = Math.min(avail / bbox.w, avail / bbox.h)
  const tx = (size - bbox.w * s) / 2 - bbox.x * s
  const ty = (size - bbox.h * s) / 2 - bbox.y * s
  return { s, tx, ty }
}

const FULL_BBOX = { x: 0, y: 0, w: 61, h: 24 }         // whole wordmark

// The wordmark's B and I overlap, so a rectangular crop can't isolate the B.
// Draw a clean heavy B (oblique, echoing the wordmark) for the tiny mark instead.
// One path, fill-rule=evenodd → the two inner shapes punch the counters.
const B_PATH = 'M6 3 H13.6 C16.6 3 18.1 4.9 18.1 7.5 C18.1 9.4 17.1 10.8 15.2 11.4 '
  + 'C17.5 12 18.8 13.6 18.8 16.1 C18.8 19.3 16.8 21 13 21 H6 Z '
  + 'M9.4 6.1 H12.9 C14.1 6.1 14.7 6.8 14.7 7.9 C14.7 9.1 14.1 9.7 12.9 9.7 H9.4 Z '
  + 'M9.4 13.7 H13.1 C14.5 13.7 15.2 14.5 15.2 15.8 C15.2 17.2 14.5 17.9 13.1 17.9 H9.4 Z'
function bMarkSvg (size, pad, radius = 0) {
  const avail = size - 2 * pad
  const s = avail / 24
  const off = (size - 24 * s) / 2
  const bg = radius
    ? `<rect width="${size}" height="${size}" rx="${radius}" fill="${DARK}"/>`
    : `<rect width="${size}" height="${size}" fill="${DARK}"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${bg}
  <g transform="translate(${off.toFixed(2)},${off.toFixed(2)}) scale(${s.toFixed(4)})">
    <g transform="skewX(-7)" transform-origin="12 12">
      <path fill="${CREAM}" fill-rule="evenodd" d="${B_PATH}"/>
    </g>
  </g>
</svg>`
}

// Square icon SVG. `clip` (bbox) restricts what's painted (used for the B-only mark).
function squareSvg (size, bbox, pad, { clip = null, radius = 0 } = {}) {
  const { s, tx, ty } = place(size, bbox, pad)
  const clipDef = clip
    ? `<clipPath id="c"><rect x="${clip.x}" y="${clip.y}" width="${clip.w}" height="${clip.h}"/></clipPath>`
    : ''
  const clipAttr = clip ? ' clip-path="url(#c)"' : ''
  const bg = radius
    ? `<rect width="${size}" height="${size}" rx="${radius}" fill="${DARK}"/>`
    : `<rect width="${size}" height="${size}" fill="${DARK}"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${bg}
  <g transform="translate(${tx.toFixed(2)},${ty.toFixed(2)}) scale(${s.toFixed(4)})">
    ${clipDef}
    <path${clipAttr} fill="${CREAM}" d="${D}"/>
  </g>
</svg>`
}

// ── favicon.svg — the "B" (legible at tiny sizes) ──
await fs.writeFile(path.join(PUB, 'favicon.svg'), bMarkSvg(48, 7) + '\n', 'utf8')

// ── raster icons ──
const bMark512 = Buffer.from(bMarkSvg(512, 96))
const wordSvg192 = Buffer.from(squareSvg(512, FULL_BBOX, 64))       // full wordmark, more air
const png = (buf, size) => sharp(buf, { density: 384 }).resize(size, size).png().toBuffer()

const ico32 = await png(bMark512, 32)               // .ico payload = the B
await fs.writeFile(path.join(PUB, 'apple-touch-icon.png'), await png(wordSvg192, 180))
await fs.writeFile(path.join(PUB, 'icon-192.png'), await png(wordSvg192, 192))
await fs.writeFile(path.join(PUB, 'icon-512.png'), await png(wordSvg192, 512))
await fs.writeFile(path.join(PUB, 'favicon-32.png'), ico32)         // preview

// ── favicon.ico (32×32, PNG-wrapped ICO container) ──
function pngToIco (pngBuf) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4)
  const entry = Buffer.alloc(16)
  entry.writeUInt8(32, 0); entry.writeUInt8(32, 1); entry.writeUInt8(0, 2); entry.writeUInt8(0, 3)
  entry.writeUInt16LE(1, 4); entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(pngBuf.length, 8); entry.writeUInt32LE(22, 12)
  return Buffer.concat([header, entry, pngBuf])
}
await fs.writeFile(path.join(PUB, 'favicon.ico'), pngToIco(ico32))

// ── og-image.png (1200×630) — wordmark on the brand bg with a cutting-mat grid ──
const OGW = 1200, OGH = 630
let grid = ''
for (let x = 0; x <= OGW; x += 40) grid += `<line x1="${x}" y1="0" x2="${x}" y2="${OGH}"/>`
for (let y = 0; y <= OGH; y += 40) grid += `<line x1="0" y1="${y}" x2="${OGW}" y2="${y}"/>`
const wp = place(OGW, FULL_BBOX, 300)   // wordmark ~600px wide, centred
const ogSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${OGW}" height="${OGH}" viewBox="0 0 ${OGW} ${OGH}">
  <rect width="${OGW}" height="${OGH}" fill="${DARK}"/>
  <g stroke="${CREAM}" stroke-width="1" opacity="0.05">${grid}</g>
  <g stroke="${CREAM}" stroke-width="1.5" opacity="0.28">
    <path d="M60 60 h34 M60 60 v34 M1140 60 h-34 M1140 60 v34 M60 570 h34 M60 570 v-34 M1140 570 h-34 M1140 570 v-34"/>
  </g>
  <g transform="translate(${wp.tx.toFixed(2)},${(OGH / 2 - FULL_BBOX.h * wp.s / 2 - 18).toFixed(2)}) scale(${wp.s.toFixed(4)})">
    <path fill="${CREAM}" d="${D}"/>
  </g>
  <g fill="${CREAM}" opacity="0.62" font-family="Arial, Helvetica, sans-serif" font-size="26" letter-spacing="6" text-anchor="middle">
    <text x="600" y="430">URBAN OBJECTS · 1:12 · HAND-FINISHED</text>
  </g>
</svg>`
await fs.writeFile(path.join(PUB, 'og-image.png'), await sharp(Buffer.from(ogSvg), { density: 144 }).resize(OGW, OGH).png().toBuffer())

console.log('generated:', (await fs.readdir(PUB)).filter(f => /favicon|icon-|apple|og-image/.test(f)).join(', '))
