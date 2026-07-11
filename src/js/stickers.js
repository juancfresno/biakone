// Stickers — folder-driven photo stack (/stickers.json) rendered through the
// shared CRT effect (see crt.js) in IMAGE mode (barrel/fisheye + scanlines).
//
// Progressive enhancement: markup is plain <img>. The effect only layers on when
// WebGL is available AND reduced-motion is off; otherwise the untouched photos
// remain visible. Live tuning from the console:
//   biakoStickers.set({ scan: 0.7, fisheye: 0.5, aberration: 0.1 })
//   biakoStickers.tune

import { createCRT } from './crt.js'
import { scrollToDeepLink, newestFirst } from './deep-link.js'

// ─── Render the folder-driven stack ────────────────────────────────────────
function cellHtml (item) {
  // Native intrinsic size → the browser (and VFX-JS, which maps the texture to
  // the element rect) keeps the real aspect ratio, so photos never warp.
  const dim = (item.w && item.h) ? ' width="' + item.w + '" height="' + item.h + '"' : ''
  return (
    '<figure class="stickers__cell">' +
      '<img src="' + item.src + '"' + dim + ' alt="" loading="lazy" decoding="async">' +
    '</figure>'
  )
}

// Per-mount CRT instance so we can tear it down on leave (WebGL / rAF cleanup).
let crt = null

function initEffect (imgs) {
  if (!imgs.length) return
  crt = createCRT({ zIndex: 2 })     // default = IMAGE tuning (barrel + aberration)
  if (!crt) return                   // reduced-motion / no WebGL → plain photos stay

  // Each sticker is added with a passthrough shader; the CRT post-effect then
  // processes the composited viewport (fand's approach).
  const addOne = (img) => {
    const go = () => crt && crt.add(img).catch(() => { img.style.opacity = '' })
    if (img.complete && img.naturalWidth) go()
    else img.addEventListener('load', go, { once: true })
  }
  imgs.forEach(addOne)

  // Live tuning handle: biakoStickers.set({ scan: 0.7, fisheye: 0.5 })
  window.biakoStickers = {
    tune: crt.cfg,
    set (patch) { if (patch && typeof patch === 'object') Object.assign(crt.cfg, patch) },
    vfx: crt.vfx,
  }
}

// Deep-link (#s-<n> from the home Stickers module) scroll — runs once the page
// has entered AND the cells are rendered.
let pageEntered = false, cellsReady = false
function maybeDeepLink () { if (pageEntered && cellsReady) scrollToDeepLink('s', '.stickers__cell') }

export function init () {
  const mount = document.getElementById('stickers-grid')
  if (!mount) return
  fetch('/stickers.json', { cache: 'no-cache' })
    .then(r => r.ok ? r.json() : [])
    .then(raw => {
      const items = newestFirst(raw)                 // newest sticker first
      if (!items.length) { mount.innerHTML = '<p class="stickers__empty">No stickers yet — drop images in /public/stickers</p>'; return }
      mount.innerHTML = items.map(cellHtml).join('')
      initEffect([...mount.querySelectorAll('.stickers__cell img')])
      cellsReady = true; maybeDeepLink()
    })
    .catch(() => {})
}

// Fires after the barba transition-in (or first load) — jump to the deep-linked
// sticker now that the page has arrived.
export function entered () { pageEntered = true; maybeDeepLink() }

export function destroy () {
  // Tear down the WebGL context + rAF and remove the fixed canvas VFX appended
  // to <body> (it lives outside the swapped container, so it must be removed).
  if (crt) { crt.destroy(); crt = null }
  pageEntered = false; cellsReady = false
  delete window.biakoStickers
}
