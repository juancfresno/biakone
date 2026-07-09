// Home v2 page module (preview route /home-v2) — Figma frame 6217:4587.
//
// Reuses existing content + effects, nothing new:
//  • typewriter for the intro (same algorithm as About),
//  • the shared VHS glitch (about-glitch-in + #about-rgb) on every image swap,
//  • the shared tag marquee + 3D lightbox (initTags/destroyTags),
//  • the work + stickers + tags manifests for all displays.
// SPA-safe: init() mounts, destroy() tears down every timer / observer / raf.

import { initTags, destroyTags } from './tags.js'
import { initElasticLines } from './elastic-line.js'
import { typewrite } from './typewriter.js'

let timers = []          // setInterval ids (slideshows)
let revealCleanup = null // scroll/resize listener teardown for reveals
let elasticDestroy = null// shared ElasticLine teardown (section dividers)
let typeCancel = null    // shared typewriter cancel
let figCleanup = null    // pixel-character teardown
let rgbSvg = null        // #about-rgb owner (only if WE created it)
let pageEntered = false
let started = false      // slideshows started once (post-entrance)
let els = {}

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

// ─── Shared VHS RGB-split filter — same def as About/Work; the glitch keyframe
// (about-glitch-in, in about.css) references #about-rgb. Inject it if absent. ──
function ensureRgbFilter () {
  if (document.getElementById('about-rgb')) return
  rgbSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  rgbSvg.setAttribute('class', 'about-defs')
  rgbSvg.setAttribute('aria-hidden', 'true')
  // A bare inline <svg> defaults to 300×150 and would add scroll height — pin it
  // to zero so it only carries the filter def (filters resolve regardless).
  rgbSvg.setAttribute('width', '0')
  rgbSvg.setAttribute('height', '0')
  rgbSvg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden'
  rgbSvg.innerHTML =
    '<filter id="about-rgb" x="-8%" y="-8%" width="116%" height="116%">' +
      '<feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" result="r"/>' +
      '<feOffset in="r" dx="6" result="ro"/>' +
      '<feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0" result="g"/>' +
      '<feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0" result="b"/>' +
      '<feOffset in="b" dx="-6" result="bo"/>' +
      '<feBlend in="ro" in2="g" mode="screen" result="rg"/>' +
      '<feBlend in="rg" in2="bo" mode="screen"/>' +
    '</filter>'
  document.body.appendChild(rgbSvg)
}

// ─── On-scroll reveal — the About glitch reveal (see home-v2.css) ────────────
// Scroll-driven (not IntersectionObserver) so an element that is scrolled PAST
// — including an instant jump to the bottom — still reveals and never stays
// stuck at opacity 0. An element reveals once its top enters the lower 92% of
// the viewport (or is already above it). CSS decides the visual: the shared
// about-glitch-in reveal, or a plain fade under prefers-reduced-motion.
function initReveals () {
  let pending = [...document.querySelectorAll('.hv2-reveal')]
  if (!pending.length) return

  let ticking = false
  const check = () => {
    const cutoff = window.innerHeight * 0.92
    pending = pending.filter(el => {
      if (el.getBoundingClientRect().top < cutoff) { el.classList.add('is-in'); return false }
      return true
    })
    if (!pending.length) teardown()
  }
  const onScroll = () => {
    if (ticking) return
    ticking = true
    requestAnimationFrame(() => { ticking = false; check() })
  }
  const teardown = () => {
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('resize', onScroll)
    revealCleanup = null
  }
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onScroll)
  revealCleanup = teardown
  check()   // reveal whatever is already in view on mount
}

// ─── Auto-playing slideshow with the shared glitch on each swap ─────────────
function slideshow (img, srcs, interval) {
  if (!img || !srcs || !srcs.length) return
  let i = 0
  img.src = srcs[0]
  if (srcs.length < 2) return
  const swap = () => {
    i = (i + 1) % srcs.length
    const next = srcs[i]
    const pre = new Image()
    const apply = () => { img.src = next; glitch(img) }
    pre.onload = apply; pre.onerror = apply; pre.src = next
  }
  timers.push(setInterval(swap, interval))
}

// ─── Data-driven displays ───────────────────────────────────────────────────
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Restart the shared VHS glitch on an element (one-shot).
function glitch (el) {
  if (!el || reduceMotion()) return
  el.classList.remove('hv2-glitch')
  void el.offsetWidth
  el.classList.add('hv2-glitch')
}

// Featured = a slider through the MAIN image (01) of EVERY piece. On each advance
// the image AND the vertical name label glitch and swap together (in sync); the
// info block (description + Materials/Scale/Status) follows the shown piece too.
function fillFeatured (items) {
  if (!items.length) return
  const pieces = items.map(p => ({
    src: (p.images && p.images[0] && p.images[0].src) || '/work/_placeholder.webp',
    name: [p.name, p.type].filter(Boolean).join(' — '),
    desc: p.description || '',
    meta: [['Materials', p.materials], ['Scale', p.scale], ['Status', p.status]].filter(([, v]) => v),
  }))
  const img    = els.featStage && els.featStage.querySelector('.hv2-featured__img')
  const nameEl = document.querySelector('[data-name]')
  const descEl = document.querySelector('[data-desc]')
  const metaEl = document.querySelector('[data-meta]')

  const paint = (p) => {
    if (img) img.src = p.src
    if (nameEl) nameEl.textContent = p.name
    if (descEl) descEl.textContent = p.desc
    if (metaEl) metaEl.innerHTML = p.meta
      .map(([k, v]) => '<div><dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd></div>').join('')
  }

  paint(pieces[0])          // start on the first piece's 01
  if (pieces.length < 2) return

  let i = 0
  const advance = () => {
    i = (i + 1) % pieces.length
    const p = pieces[i]
    const pre = new Image()
    const apply = () => {
      paint(p)              // new image + new name + info appear together…
      glitch(img)           // …and the image + name glitch in sync
      glitch(nameEl)
    }
    pre.onload = apply; pre.onerror = apply; pre.src = p.src
  }
  timers.push(setInterval(advance, 3200))
}

function fillCarousel (items) {
  if (!els.carousel || !items.length) return
  const card = (p) => {
    const cover = p.images && p.images[0] ? p.images[0].src : '/work/_placeholder.webp'
    return '<figure class="hv2-carousel__item">' +
      '<img src="' + cover + '" alt="' + esc(p.name) + '" loading="lazy" decoding="async" draggable="false">' +
      '</figure>'
  }
  // Duplicate the set so the -50% conveyor loops seamlessly (tag-marquee trick).
  const half = items.map(card).join('')
  els.carousel.innerHTML = '<div class="hv2-carousel__track">' + half + half + '</div>'
  const all = els.carousel.querySelectorAll('.hv2-carousel__item')
  for (let i = items.length; i < all.length; i++) all[i].setAttribute('aria-hidden', 'true')
}

// ─── Pixel character ────────────────────────────────────────────────────────
// Idle = cycle frames 1–4 (breathe + blink). Hover or cursor proximity → frame 5
// (arm raised). Reduced-motion: static frame 1, but still raises on hover.
function initFigure () {
  const el = document.getElementById('hv2-figure')
  const img = el && el.querySelector('.hv2-figure__img')
  if (!img) return
  const base = '/home/character/'
  const idle = ['frame-1.svg', 'frame-2.svg', 'frame-3.svg', 'frame-4.svg'].map(f => base + f)
  const wave = base + 'frame-5.svg'
  ;[...idle, wave].forEach(src => { const p = new Image(); p.src = src })  // preload

  let i = 0, raised = false, tick = 0
  img.src = idle[0]
  const show = () => { img.src = raised ? wave : idle[i] }
  const raise = () => { if (!raised) { raised = true; show() } }
  const lower = () => { if (raised) { raised = false; show() } }

  if (!reduceMotion()) {
    tick = setInterval(() => { if (!raised) { i = (i + 1) % idle.length; show() } }, 380)
    timers.push(tick)
  }
  el.addEventListener('pointerenter', raise)
  el.addEventListener('pointerleave', lower)

  let onMove = null
  if (!reduceMotion() && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    onMove = (e) => {
      const r = el.getBoundingClientRect()
      const near = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)) < 120
      near ? raise() : lower()
    }
    window.addEventListener('mousemove', onMove, { passive: true })
  }
  figCleanup = () => {
    if (tick) clearInterval(tick)
    el.removeEventListener('pointerenter', raise)
    el.removeEventListener('pointerleave', lower)
    if (onMove) window.removeEventListener('mousemove', onMove)
  }
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────
export function init () {
  els = {
    type: document.getElementById('hv2-type'),
    featStage: document.getElementById('hv2-featured-stage'),
    tagbox: document.getElementById('hv2-tagbox'),
    stickers: document.getElementById('hv2-stickers'),
    carousel: document.getElementById('hv2-carousel'),
  }
  if (!document.querySelector('.home-v2')) { initTags(); return }

  ensureRgbFilter()
  initFigure()

  // Section dividers (Escale World / Stickers / Lab) get the SAME elastic
  // drag/bounce line as the Work list rows (shared elastic-line.js). Desktop /
  // fine-pointer only; the static CSS border is the fallback otherwise.
  elasticDestroy = initElasticLines(
    document.querySelectorAll('.hv2-head'),
    { className: 'hv2-elastic-line', activeClass: 'hv2-head--elastic' })

  // Work manifest → featured slideshow + Escale World carousel.
  fetch('/work.json', { cache: 'no-cache' })
    .then(r => r.ok ? r.json() : [])
    .then(items => { fillFeatured(items); fillCarousel(items) })
    .catch(() => {})

  // Tags manifest → glitch tag box (offset interval so it doesn't sync w/ others).
  fetch('/tags.json', { cache: 'no-cache' })
    .then(r => r.ok ? r.json() : [])
    .then(items => {
      const srcs = items.map(t => t.src).filter(Boolean)
      if (els.tagbox) slideshow(els.tagbox.querySelector('.hv2-tagbox__img'), srcs, 2300)
    })
    .catch(() => {})

  // Stickers manifest → cycling strip.
  fetch('/stickers.json', { cache: 'no-cache' })
    .then(r => r.ok ? r.json() : [])
    .then(items => {
      const srcs = items.map(s => s.src).filter(Boolean)
      if (els.stickers) slideshow(els.stickers.querySelector('.hv2-stickers__img'), srcs, 2700)
    })
    .catch(() => {})

  initTags()   // shared marquee + lightbox
}

// Fires after the page-transition-in completes (or on first load). The intro
// types first, then the scroll reveals cascade (Welcome → tag box → piece text
// + image) — coordinated here so the sequence reads AFTER the page has arrived.
export function entered () {
  pageEntered = true
  if (started) return
  started = true
  typeCancel = typewrite(els.type, { caretClass: 'hv2-caret' })
  initReveals()
}

export function destroy () {
  timers.forEach(clearInterval); timers = []
  if (revealCleanup) revealCleanup()
  if (elasticDestroy) { elasticDestroy(); elasticDestroy = null }
  if (figCleanup) { figCleanup(); figCleanup = null }
  if (typeCancel) { typeCancel(); typeCancel = null }
  if (rgbSvg) { rgbSvg.remove(); rgbSvg = null }
  pageEntered = false; started = false; els = {}
  destroyTags()
}
