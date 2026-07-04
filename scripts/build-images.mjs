// build-images.mjs
//
// Folder-driven image pipeline. For each source folder under public/:
//   1. scan for raster/vector images
//   2. generate optimized WebP siblings in <folder>/_opt (raster only)
//   3. write <folder>.json manifest at public/<name>.json
//
// Sources are declared in SECTIONS below. Add a new section = drop images and
// they appear on that page.
//
// URL convention: Vite copies public/ to dist/ root, so /public/feed/x.png
// becomes /feed/x.png at runtime. Manifest paths therefore start at /<folder>/.

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Add a section = drop images at public/<name>/ and rebuild.
const SECTIONS = [
  { name: 'feed',     manifest: 'feed.json' },
  { name: 'stickers', manifest: 'stickers.json' },
  { name: 'tags',     manifest: 'tags.json' },
  { name: 'about',    manifest: 'about.json' },
]
// `work` is NOT a flat section — it's built by buildWork() below, because each
// project is a SUBFOLDER (public/work/<NN-slug>/) holding image(s) + meta.json.

const RASTER_EXT  = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif'])
const VECTOR_EXT  = new Set(['.svg'])
const MAX_EDGE    = 1280
const OPT_QUALITY = 80

function isSource (name) {
  if (name.startsWith('.')) return false
  if (name.startsWith('_')) return false           // ignore _opt sibling folders
  const ext = path.extname(name).toLowerCase()
  return RASTER_EXT.has(ext) || VECTOR_EXT.has(ext)
}

async function optimize (folder, srcAbs, name) {
  const stem   = path.basename(name, path.extname(name))
  const ext    = path.extname(name).toLowerCase()
  const optAbs = path.join(ROOT, 'public', folder, '_opt', `${stem}.webp`)
  const optUrl = `/${folder}/_opt/${stem}.webp`
  const srcUrl = `/${folder}/${name}`

  // SVG: point manifest at the original.
  if (VECTOR_EXT.has(ext)) {
    return { src: srcUrl, name }
  }

  // Skip work if optimized is newer than source.
  try {
    const [srcStat, outStat] = await Promise.all([fs.stat(srcAbs), fs.stat(optAbs)])
    if (outStat.mtimeMs >= srcStat.mtimeMs) {
      return { src: optUrl, name, srcBytes: srcStat.size, optBytes: outStat.size, cached: true }
    }
  } catch { /* fall through */ }

  const srcStat = await fs.stat(srcAbs)
  await sharp(srcAbs, { failOn: 'none' })
    .rotate()                                                     // honor EXIF
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: OPT_QUALITY, effort: 5 })
    .toFile(optAbs)

  const outStat = await fs.stat(optAbs)
  return { src: optUrl, name, srcBytes: srcStat.size, optBytes: outStat.size }
}

function fmtMB (bytes) { return (bytes / 1024 / 1024).toFixed(2) + ' MB' }

async function buildSection ({ name: folder, manifest }) {
  const dirAbs = path.join(ROOT, 'public', folder)
  const optAbs = path.join(dirAbs, '_opt')

  let entries = []
  try {
    entries = await fs.readdir(dirAbs, { withFileTypes: true })
  } catch (err) {
    if (err.code === 'ENOENT') {
      // Section folder doesn't exist yet — write empty manifest and move on.
      await fs.mkdir(path.join(ROOT, 'public'), { recursive: true })
      await fs.writeFile(path.join(ROOT, 'public', manifest), '[]\n', 'utf8')
      console.log(`build-images[${folder}]: no folder — wrote empty ${manifest}`)
      return
    }
    throw err
  }

  const files = entries
    .filter(e => e.isFile() && isSource(e.name))
    .map(e => e.name)
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' }))

  if (files.length) await fs.mkdir(optAbs, { recursive: true })

  const items = []
  let totalSrc = 0, totalOpt = 0
  for (const name of files) {
    const result = await optimize(folder, path.join(dirAbs, name), name)
    items.push({ src: result.src, name })
    if (result.srcBytes != null) {
      totalSrc += result.srcBytes
      totalOpt += result.optBytes
      if (!result.cached) {
        console.log(`  ${folder}/${name}  ${fmtMB(result.srcBytes)} → ${fmtMB(result.optBytes)}`)
      }
    }
  }

  const outPath = path.join(ROOT, 'public', manifest)
  await fs.writeFile(outPath, JSON.stringify(items, null, 2) + '\n', 'utf8')

  console.log(`build-images[${folder}]: ${items.length} entries → public/${manifest}`)
  if (totalSrc) {
    const pct = ((1 - totalOpt / totalSrc) * 100).toFixed(1)
    console.log(`build-images[${folder}]: ${fmtMB(totalSrc)} → ${fmtMB(totalOpt)} (-${pct}%)`)
  }
}

// ─── WORK — project-per-subfolder builder ──────────────────────────────────
// public/work/<NN-slug>/  →  image(s) + meta.json  →  rich public/work.json:
//   [{ code, slug, name, scale, date, description, images:[{src}] }]
// Add a project = drop a subfolder with images + meta.json and rebuild.
async function buildWork () {
  const workAbs = path.join(ROOT, 'public', 'work')
  let dirs = []
  try {
    const entries = await fs.readdir(workAbs, { withFileTypes: true })
    dirs = entries
      .filter(e => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('.'))
      .map(e => e.name)
      .sort((a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' }))
  } catch (err) {
    if (err.code === 'ENOENT') {
      await fs.mkdir(path.join(ROOT, 'public'), { recursive: true })
      await fs.writeFile(path.join(ROOT, 'public', 'work.json'), '[]\n', 'utf8')
      console.log('build-images[work]: no folder — wrote empty work.json')
      return
    }
    throw err
  }

  const projects = []
  let totalSrc = 0, totalOpt = 0
  for (let idx = 0; idx < dirs.length; idx++) {
    const slug = dirs[idx]
    const dirAbs = path.join(workAbs, slug)
    const entries = await fs.readdir(dirAbs, { withFileTypes: true })
    const imgFiles = entries
      .filter(e => e.isFile() && isSource(e.name))
      .map(e => e.name)
      .sort((a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' }))

    let meta = {}
    try { meta = JSON.parse(await fs.readFile(path.join(dirAbs, 'meta.json'), 'utf8')) } catch { /* optional */ }

    if (imgFiles.length) await fs.mkdir(path.join(dirAbs, '_opt'), { recursive: true })
    const images = []
    for (const name of imgFiles) {
      const r = await optimize(`work/${slug}`, path.join(dirAbs, name), name)
      images.push({ src: r.src })
      if (r.srcBytes != null) { totalSrc += r.srcBytes; totalOpt += r.optBytes }
    }

    projects.push({
      code: String(idx + 1).padStart(2, '0'),
      slug,
      name: meta.name || slug.replace(/^\d+-/, '').replace(/[-_]/g, ' ').toUpperCase(),
      scale: meta.scale || '1:12',
      date: meta.date || '',
      description: meta.description || '',
      images,
    })
  }

  await fs.writeFile(path.join(ROOT, 'public', 'work.json'), JSON.stringify(projects, null, 2) + '\n', 'utf8')
  console.log(`build-images[work]: ${projects.length} projects → public/work.json`)
  if (totalSrc) {
    const pct = ((1 - totalOpt / totalSrc) * 100).toFixed(1)
    console.log(`build-images[work]: ${fmtMB(totalSrc)} → ${fmtMB(totalOpt)} (-${pct}%)`)
  }
}

async function main () {
  for (const section of SECTIONS) await buildSection(section)
  await buildWork()
}

main().catch(err => {
  console.error('build-images failed:', err)
  process.exit(1)
})
