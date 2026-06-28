// build-feed.mjs
// Scans public/feed/ for image files and writes public/feed.json:
//   [{ "src": "/public/feed/01.png", "name": "01.png" }, ...]
//
// Vercel is configured with outputDirectory "." (the project root), so files
// under ./public are served at /public/* — the URL prefix reflects that.
// Sorted alphanumerically by filename so 01.png … 19.png line up.
// Runs as Vercel buildCommand. No deps. Drop image → push → it appears.

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT     = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FEED_DIR = path.join(ROOT, 'public', 'feed')
const OUT_PATH = path.join(ROOT, 'public', 'feed.json')

const EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.svg'])

async function main () {
  let entries = []
  try {
    entries = await fs.readdir(FEED_DIR, { withFileTypes: true })
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
    // No feed dir yet — emit an empty list and move on.
  }

  const files = entries
    .filter(e => e.isFile() && EXT.has(path.extname(e.name).toLowerCase()))
    .filter(e => !e.name.startsWith('.'))
    .map(e => e.name)
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' }))

  const feed = files.map(name => ({
    src: `/public/feed/${name}`,
    name
  }))

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true })
  await fs.writeFile(OUT_PATH, JSON.stringify(feed, null, 2) + '\n', 'utf8')

  console.log(`build-feed: wrote ${feed.length} entries → ${path.relative(ROOT, OUT_PATH)}`)
}

main().catch(err => {
  console.error('build-feed failed:', err)
  process.exit(1)
})
