// Home page module (route /) — Figma frame 6217:4587.
//
// Reuses existing content + effects, nothing new:
//  • the shared VHS glitch (about-glitch-in + #about-rgb) on every text/image
//    entrance AND on every slider change (name + description),
//  • the shared tag marquee + 3D lightbox (initTags/destroyTags),
//  • the work + stickers + tags manifests for all displays.
// SPA-safe: init() mounts, destroy() tears down every timer / observer / raf.

import { initElasticLines } from './elastic-line.js'
import { initCharacter } from './pixel-character.js'
import { setPendingDeepLink } from './deep-link.js'

let timers = []          // setInterval ids (slideshows)
let revealCleanup = null // scroll/resize listener teardown for reveals
let elasticDestroy = null// shared ElasticLine teardown (section dividers)
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
// onShow(i) fires with the index of the item currently displayed (initial + each
// swap) — used to keep a module's deep-link href in sync with what it shows.
function slideshow (img, srcs, interval, onShow) {
  if (!img || !srcs || !srcs.length) return
  let i = 0
  img.src = srcs[0]
  if (onShow) onShow(0)
  if (srcs.length < 2) return
  const swap = () => {
    i = (i + 1) % srcs.length
    const next = srcs[i]
    const pre = new Image()
    const apply = () => { img.src = next; glitch(img); if (onShow) onShow(i) }
    pre.onload = apply; pre.onerror = apply; pre.src = next
  }
  timers.push(setInterval(swap, interval))
}

// ─── Data-driven displays ───────────────────────────────────────────────────
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Restart the shared VHS/about-glitch on an element (one-shot). On a reveal
// element we re-trigger its own `is-in` reveal (same about-glitch-in) so it
// re-glitches; on anything else we use the standalone .hv2-glitch class.
function glitch (el) {
  if (!el || reduceMotion()) return
  const cls = el.classList.contains('hv2-reveal') ? 'is-in' : 'hv2-glitch'
  el.classList.remove(cls)
  void el.offsetWidth
  el.classList.add(cls)
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
  const infoEl = document.querySelector('.hv2-featured-info')

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
      paint(p)              // new image + new name + description appear together…
      glitch(img)           // …and the image, name AND description glitch in sync
      glitch(nameEl)
      glitch(infoEl)
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

// Posters module → cycles the /posters images. Each swap uses the VHS
// channel-change (static cut) — the same static/noise language as the barba
// page transition (transition.css .vhs__static), NOT the glitch the Stickers
// module next to it uses. Scoped to the small module → performant.
function initPosters (srcs) {
  const stage = document.getElementById('hv2-posters')
  const img = stage && stage.querySelector('.hv2-posters-mod__img')
  if (!img || !srcs.length) return
  // Keep the module's link pointed at the poster it's currently showing (href for
  // new-tab/direct entry; click records the intent for the barba SPA nav).
  const link = stage.closest('.hv2-posters-mod')
  const setHref = (idx) => { if (link) link.setAttribute('href', '/posters#p-' + idx) }
  let i = 0
  if (link) link.addEventListener('click', () => setPendingDeepLink('p-' + i))
  img.src = srcs[0]
  setHref(0)
  if (srcs.length < 2) return
  const swap = () => {
    i = (i + 1) % srcs.length
    const next = srcs[i]
    const pre = new Image()
    pre.onload = pre.onerror = () => {
      if (reduceMotion()) { img.src = next; setHref(i); return }   // plain swap
      stage.classList.remove('is-cut')
      void stage.offsetWidth                           // reflow → restart the cut
      stage.classList.add('is-cut')
      setTimeout(() => { img.src = next; setHref(i) }, 170)   // swap hidden behind the static peak
    }
    pre.src = next
  }
  timers.push(setInterval(swap, 3000))
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────
export function init () {
  els = {
    featStage: document.getElementById('hv2-featured-stage'),
    tagbox: document.getElementById('hv2-tagbox'),
    stickers: document.getElementById('hv2-stickers'),
    carousel: document.getElementById('hv2-carousel'),
  }
  if (!document.querySelector('.home-v2')) { return }

  ensureRgbFilter()
  figCleanup = initCharacter(document.getElementById('hv2-figure'))

  // Section dividers (Escale World / Stickers / Lab / Posters) get the SAME
  // elastic drag/bounce line as the portfolio's ElasticLine (shared
  // elastic-line.js). Desktop / fine-pointer only; static CSS border otherwise.
  elasticDestroy = initElasticLines(
    document.querySelectorAll('.hv2-head'),
    { className: 'hv2-elastic-line', activeClass: 'hv2-head--elastic' })

  // Work manifest → featured slideshow + Escale World carousel.
  fetch('/work.json', { cache: 'no-cache' })
    .then(r => r.ok ? r.json() : [])
    .then(items => {
      fillFeatured(items); fillCarousel(items)
      // The meta block grows once populated; on the viewport-fit hero it can
      // start below the reveal cutoff (empty → no text), so the initial check
      // misses it and there's no scroll to retrigger. Re-run the reveal check
      // now that it has its real height.
      window.dispatchEvent(new Event('resize'))
    })
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
      if (els.stickers) {
        // Keep the module's link pointed at the sticker it's currently showing;
        // record the click intent for the barba SPA nav (hash gets stripped).
        const link = els.stickers.closest('.hv2-stickers')
        let curIdx = 0
        if (link) link.addEventListener('click', () => setPendingDeepLink('s-' + curIdx))
        slideshow(els.stickers.querySelector('.hv2-stickers__img'), srcs, 2700,
          (i) => { curIdx = i; if (link) link.setAttribute('href', '/stickers#s-' + i) })
      }
    })
    .catch(() => {})

  // Posters manifest → Posters module (VHS-cut cycle, same images as /posters).
  fetch('/posters.json', { cache: 'no-cache' })
    .then(r => r.ok ? r.json() : [])
    .then(items => initPosters(items.map(p => p.src).filter(Boolean)))
    .catch(() => {})
}

// Fires after the page-transition-in completes (or on first load). The reveals
// cascade here (Welcome → tag box → piece text + image) — every text block enters
// with the shared VHS glitch, coordinated AFTER the page has arrived.
export function entered () {
  pageEntered = true
  if (started) return
  started = true
  initReveals()
}

export function destroy () {
  timers.forEach(clearInterval); timers = []
  if (revealCleanup) revealCleanup()
  if (elasticDestroy) { elasticDestroy(); elasticDestroy = null }
  if (figCleanup) { figCleanup(); figCleanup = null }
  if (rgbSvg) { rgbSvg.remove(); rgbSvg = null }
  pageEntered = false; started = false; els = {}
}
