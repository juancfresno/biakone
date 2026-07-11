// TAGS — infinite parallax canvas (/lab/tags).
//
// Technique ported from Codrops "Building an Infinite Parallax Grid with GSAP and
// seamless tiling" (tympanus.net, 2025-06-11): a base tile of scattered tags is
// duplicated 2×2, then each frame lerps a scroll target toward its current value
// and wraps every tile by the doubled tile size — so the plane pans infinitely in
// BOTH axes with no seams. Drag + wheel pan; depth layers parallax against scroll
// velocity and (desktop) the cursor. The tags float scattered at varied sizes /
// rotations over the shared AMBIENT CRT backdrop (crt.js).
//
// SPA-safe: init()/entered()/destroy() own the rAF loop + all listeners.

import { createCRT, CRT_AMBIENT, CRT_AMBIENT_MOBILE } from './crt.js'

// ─── Tunables ────────────────────────────────────────────────────────────────
const EASE       = 0.075        // scroll lerp — smaller = heavier glide
const WHEEL_MULT  = 0.5         // wheel delta → pan
const PARALLAX_V  = 4.0         // depth parallax vs scroll velocity
const PARALLAX_M  = 0.45        // depth parallax vs cursor (desktop)
const GRID_COLS   = 6           // base-tile scatter grid (36 tags → 6×6)
const CELL        = 360         // logical cell size (px) → tile = COLS*CELL

// Deterministic PRNG (mulberry32) so the scatter is identical every load / SSR.
function mulberry32 (a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

let plane = null
let crt = null, crtSrc = null
let items = []
let raf = 0
let winW = 0, winH = 0
let tileW = 0, tileH = 0
let reduce = false
const scroll = { current: { x: 0, y: 0 }, target: { x: 0, y: 0 }, last: { x: 0, y: 0 } }
const mouse  = { x: 0.5, y: 0.5 }
const drag   = { active: false, id: null, startX: 0, startY: 0, baseX: 0, baseY: 0, moved: 0 }
let onDown, onMove, onUp, onWheel, onPointerMove, onResize

// ─── Build the scattered base tile, then 2×2-duplicate for seamless wrap ──────
function build (tags) {
  const rnd = mulberry32(0x1AB5)          // fixed seed → stable layout
  const cols = GRID_COLS
  const rows = Math.ceil(tags.length / cols)
  const tileWSingle = cols * CELL
  const tileHSingle = rows * CELL

  // One tag per jittered grid cell — varied size, rotation, depth.
  const base = tags.map((t, i) => {
    const cx = (i % cols) * CELL
    const cy = Math.floor(i / cols) * CELL
    const ar = (t.w && t.h) ? t.w / t.h : 1.4
    const w  = 150 + rnd() * 150                     // 150–300px displayed width
    const h  = w / ar
    const x  = cx + rnd() * (CELL - w) * 0.9
    const y  = cy + (rnd() * (CELL - h) * 0.9)
    const rot  = (rnd() - 0.5) * 34                  // −17°…17°
    const ease = 0.5 + rnd() * 0.5                   // depth 0.5–1.0
    return { src: t.src, x, y, w, h, rot, ease }
  })

  // 2×2 duplication (Codrops): 4 instances offset by the single-tile size, then
  // double the tile so wrapping happens over the duplicated span.
  const repsX = [0, tileWSingle]
  const repsY = [0, tileHSingle]
  const frag = document.createDocumentFragment()
  items = []
  let n = 0
  base.forEach((b, bi) => {
    repsX.forEach(ox => {
      repsY.forEach(oy => {
        const el = document.createElement('div')
        el.className = 'tags-tile'
        el.style.setProperty('--rv-i', String(bi))          // staggered reveal by base index
        el.style.width = b.w + 'px'
        el.style.height = b.h + 'px'
        const img = document.createElement('img')
        img.className = 'tags-tile__img'
        img.src = b.src
        img.alt = ''
        img.draggable = false
        img.decoding = 'async'
        img.loading = 'lazy'
        el.appendChild(img)
        frag.appendChild(el)
        items.push({ el, x: b.x + ox, y: b.y + oy, w: b.w, h: b.h, rot: b.rot, ease: b.ease, extraX: 0, extraY: 0 })
        n++
      })
    })
  })
  plane.appendChild(frag)
  tileW = tileWSingle * 2
  tileH = tileHSingle * 2

  // Start roughly centred on the plane.
  scroll.current.x = scroll.target.x = scroll.last.x = -tileW / 4 + winW / 2
  scroll.current.y = scroll.target.y = scroll.last.y = -tileH / 4 + winH / 2
  position(true)   // place once immediately (before reveal)
}

// ─── Per-frame position with parallax + infinite wrap ─────────────────────────
function position (instant) {
  const dx = scroll.current.x - scroll.last.x
  const dy = scroll.current.y - scroll.last.y
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    const parX = PARALLAX_V * dx * it.ease + (mouse.x - 0.5) * it.w * PARALLAX_M
    const parY = PARALLAX_V * dy * it.ease + (mouse.y - 0.5) * it.h * PARALLAX_M
    let posX = it.x + scroll.current.x + it.extraX + parX
    let posY = it.y + scroll.current.y + it.extraY + parY
    // Wrap: as a tile leaves one edge, shift it a full (doubled) tile so its
    // duplicate seamlessly fills the opposite side.
    if (posX > winW)          { it.extraX -= tileW; posX -= tileW }
    else if (posX + it.w < 0) { it.extraX += tileW; posX += tileW }
    if (posY > winH)          { it.extraY -= tileH; posY -= tileH }
    else if (posY + it.h < 0) { it.extraY += tileH; posY += tileH }
    it.el.style.transform = 'translate3d(' + posX + 'px,' + posY + 'px,0) rotate(' + it.rot + 'deg)'
  }
  if (!instant) { scroll.last.x = scroll.current.x; scroll.last.y = scroll.current.y }
}

function tick () {
  scroll.current.x += (scroll.target.x - scroll.current.x) * EASE
  scroll.current.y += (scroll.target.y - scroll.current.y) * EASE
  position(false)
  raf = requestAnimationFrame(tick)
}

// ─── Ambient CRT backdrop (shared crt.js) — behind the plane ──────────────────
function initBackdrop () {
  crt = createCRT({ zIndex: -1, tune: CRT_AMBIENT, mobileTune: CRT_AMBIENT_MOBILE })
  if (!crt) return
  crtSrc = document.createElement('div')
  crtSrc.className = 'lab-crt-src'
  crtSrc.setAttribute('aria-hidden', 'true')
  document.body.appendChild(crtSrc)
  crt.add(crtSrc)
}

// ─── Input — drag (mouse + touch) + wheel pan; cursor parallax (desktop) ──────
function bindInput () {
  onDown = (e) => {
    drag.active = true; drag.id = e.pointerId; drag.moved = 0
    drag.startX = e.clientX; drag.startY = e.clientY
    drag.baseX = scroll.target.x; drag.baseY = scroll.target.y
    plane.classList.add('is-dragging')
    try { plane.setPointerCapture(e.pointerId) } catch {}
  }
  onMove = (e) => {
    if (!drag.active || e.pointerId !== drag.id) return
    const dx = e.clientX - drag.startX, dy = e.clientY - drag.startY
    drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy))
    scroll.target.x = drag.baseX + dx
    scroll.target.y = drag.baseY + dy
    // Touch: stop the browser/Lenis from scrolling the page under the drag.
    if (e.pointerType === 'touch' && e.cancelable) e.preventDefault()
  }
  onUp = (e) => {
    if (!drag.active) return
    drag.active = false; plane.classList.remove('is-dragging')
    try { plane.releasePointerCapture(e.pointerId) } catch {}
  }
  // Cursor parallax — desktop pointers only (no hover on touch).
  onPointerMove = (e) => {
    if (e.pointerType === 'touch') return
    mouse.x = e.clientX / winW
    mouse.y = e.clientY / winH
  }
  onWheel = (e) => {
    e.preventDefault()
    scroll.target.x -= e.deltaX * WHEEL_MULT
    scroll.target.y -= e.deltaY * WHEEL_MULT
  }
  plane.addEventListener('pointerdown', onDown)
  plane.addEventListener('pointermove', onMove)
  plane.addEventListener('pointerup', onUp)
  plane.addEventListener('pointercancel', onUp)
  window.addEventListener('pointermove', onPointerMove, { passive: true })
  plane.addEventListener('wheel', onWheel, { passive: false })
  onResize = () => { winW = window.innerWidth; winH = window.innerHeight }
  window.addEventListener('resize', onResize)
}

export function init () {
  plane = document.getElementById('tags-plane')
  if (!plane) return
  reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  winW = window.innerWidth; winH = window.innerHeight
  initBackdrop()
  fetch('/lab/tags.json', { cache: 'no-cache' })
    .then(r => r.ok ? r.json() : [])
    .then(tags => {
      if (!tags.length) { plane.innerHTML = '<p class="tags-empty">No tags yet — drop images in /public/lab/tags</p>'; return }
      build(tags)
      bindInput()
      if (reduce) { position(true) }        // static under reduced-motion (no rAF glide)
      else raf = requestAnimationFrame(tick)
      revealTiles()                          // in case entered() already fired
    })
    .catch(() => {})
}

// Glitch-reveal the tags in (staggered) once the page has entered.
let revealed = false
function revealTiles () {
  if (revealed || !plane) return
  revealed = true
  requestAnimationFrame(() => plane.classList.add('is-in'))
}
export function entered () { revealTiles() }

export function destroy () {
  cancelAnimationFrame(raf); raf = 0
  if (plane) {
    plane.removeEventListener('pointerdown', onDown)
    plane.removeEventListener('pointermove', onMove)
    plane.removeEventListener('pointerup', onUp)
    plane.removeEventListener('pointercancel', onUp)
    plane.removeEventListener('wheel', onWheel)
    plane.innerHTML = ''
    plane.classList.remove('is-in')
  }
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('resize', onResize)
  if (crt) { crt.destroy(); crt = null }
  if (crtSrc) { crtSrc.remove(); crtSrc = null }
  items = []
  scroll.current = { x: 0, y: 0 }; scroll.target = { x: 0, y: 0 }; scroll.last = { x: 0, y: 0 }
  mouse.x = 0.5; mouse.y = 0.5
  drag.active = false
  revealed = false
  plane = null
}
