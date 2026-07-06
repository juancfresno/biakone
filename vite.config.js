// Vite config for Biako.
// Multi-page setup: one HTML entry per section. Shared shell is injected via a
// small custom plugin that expands `<!-- @include partials/foo.html -->` at
// transform time. Zero runtime, zero framework — HTML remains static.

import { defineConfig } from 'vite'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ─── @include partials plugin ─────────────────────────────────────────────
// Replace <!-- @include partials/nav.html --> with the file contents. Runs at
// pre-order so Vite still rewrites asset URLs inside the injected markup.
function partialsPlugin () {
  const includeRe = /<!--\s*@include\s+([^\s]+)\s*-->/g
  const partialsRoot = resolve(__dirname, 'src')
  function inject (html) {
    return html.replace(includeRe, (_, name) => {
      const abs = resolve(partialsRoot, name)
      let content = readFileSync(abs, 'utf8')
      if (includeRe.test(content)) content = inject(content)
      return content
    })
  }
  return {
    name: 'biako-partials',
    transformIndexHtml: { order: 'pre', handler: inject },
  }
}

// ─── clean URLs for dev server ────────────────────────────────────────────
// Vercel prod serves /about → about.html via cleanUrls. Mirror that locally so
// nav links work identically in dev.
function cleanUrlsDev () {
  return {
    name: 'biako-clean-urls-dev',
    configureServer (server) {
      server.middlewares.use((req, _res, next) => {
        const url = req.url ?? '/'
        if (
          url !== '/' &&
          !url.endsWith('/') &&
          !url.includes('.') &&
          !url.startsWith('/@') &&
          !url.startsWith('/src') &&
          !url.startsWith('/node_modules')
        ) {
          req.url = url + '.html'
        }
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [partialsPlugin(), cleanUrlsDev()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        home:     resolve(__dirname, 'index.html'),
        work:     resolve(__dirname, 'work.html'),
        stickers: resolve(__dirname, 'stickers.html'),
        lab:      resolve(__dirname, 'lab.html'),
        'vandal-rush': resolve(__dirname, 'lab/vandal-rush.html'),
        about:    resolve(__dirname, 'about.html'),
        contact:  resolve(__dirname, 'contact.html'),
      },
    },
  },
})
