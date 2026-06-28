// build-feed.mjs
//
// 1. Scans public/feed/ for source images (PNG/JPG/WebP/AVIF/GIF/SVG).
// 2. For each raster source, generates an optimized WebP in public/feed/_opt/
//    (long edge resized to MAX_EDGE, quality OPT_QUALITY). SVGs pass through.
// 3. Writes public/feed.json pointing to the OPTIMIZED paths.
//
// Vercel runs this via buildCommand (see vercel.json). outputDirectory is "."
// so URLs use the /public/* prefix. Drop image → push → carousel renders it.
//
// Local workflow:
//   npm install     # once, to grab sharp
//   npm run build   # regenerate WebPs + feed.json after dropping a new image

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT     = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FEED_DIR = path.join(ROOT, 'public', 'feed')
const OPT_DIR  = path.join(FEED_DIR, '_opt')
const OUT_PATH = path.join(ROOT, 'public', 'feed.json')

const RASTER_EXT  = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif'])
const VECTOR_EXT  = new Set(['.svg'])
const MAX_EDGE    = 1280
const OPT_QUALITY = 80

function isSource (name) {
  if (name.startsWith('.')) return false
  if (name.startsWith('_')) return false           // ignore _opt/ siblings
  const ext = path.extname(name).toLowerCase()
  return RASTER_EXT.has(ext) || VECTOR_EXT.has(ext)
}

async function optimize (srcAbs, name) {
  const stem      = path.basename(name, path.extname(name))
  const ext       = path.extname(name).toLowerCase()
  const outName   = `${stem}.webp`
  const outAbs    = path.join(OPT_DIR, outName)
  const outUrl    = `/public/feed/_opt/${outName}`

  // SVG: pass through, point feed.json at the original.
  if (VECTOR_EXT.has(ext)) {
    return { src: `/public/feed/${name}`, name, savedBytes: 0 }
  }

  // Skip work if the optimized file is newer than the source.
  try {
    const [srcStat, outStat] = await Promise.all([fs.stat(srcAbs), fs.stat(outAbs)])
    if (outStat.mtimeMs >= srcStat.mtimeMs) {
      return { src: outUrl, name, savedBytes: srcStat.size - outStat.size }
    }
  } catch { /* missing optimized file — fall through */ }

  const srcStat = await fs.stat(srcAbs)
  await sharp(srcAbs, { failOn: 'none' })
    .rotate()                                                  // honor EXIF
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: OPT_QUALITY, effort: 5 })
    .toFile(outAbs)

  const outStat = await fs.stat(outAbs)
  return { src: outUrl, name, savedBytes: srcStat.size - outStat.size, srcBytes: srcStat.size, optBytes: outStat.size }
}

function fmtMB (bytes) { return (bytes / 1024 / 1024).toFixed(2) + ' MB' }

async function main () {
  let entries = []
  try {
    entries = await fs.readdir(FEED_DIR, { withFileTypes: true })
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
  }

  const files = entries
    .filter(e => e.isFile() && isSource(e.name))
    .map(e => e.name)
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' }))

  if (files.length) await fs.mkdir(OPT_DIR, { recursive: true })

  const feed = []
  let totalSrc = 0, totalOpt = 0
  for (const name of files) {
    const result = await optimize(path.join(FEED_DIR, name), name)
    feed.push({ src: result.src, name })
    if (result.srcBytes != null) {
      totalSrc += result.srcBytes
      totalOpt += result.optBytes
      console.log(`  ${name}  ${fmtMB(result.srcBytes)} → ${fmtMB(result.optBytes)}`)
    }
  }

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true })
  await fs.writeFile(OUT_PATH, JSON.stringify(feed, null, 2) + '\n', 'utf8')

  const rel = path.relative(ROOT, OUT_PATH)
  console.log(`build-feed: wrote ${feed.length} entries → ${rel}`)
  if (totalSrc) {
    const pct = ((1 - totalOpt / totalSrc) * 100).toFixed(1)
    console.log(`build-feed: ${fmtMB(totalSrc)} → ${fmtMB(totalOpt)} (-${pct}%)`)
  }
}

main().catch(err => {
  console.error('build-feed failed:', err)
  process.exit(1)
})
