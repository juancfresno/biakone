// About page module — folder-driven horizontal photo strip (/about.json) with:
//  • the body copy entering with the shared VHS glitch reveal once the page has entered,
//  • a VHS glitch-reveal entrance on the photos (staggered left→right),
//  • a BIAKO-wordmark custom cursor (difference-blended) over the strip,
// plus the existing click-drag pan and the shared tag marquee + lightbox.
// Everything cleans up on leave (SPA-safe).
import { initElasticLines } from './elastic-line.js'
import { initCharacter } from './pixel-character.js'

let strip, cursorEl, rgbSvg
let pageEntered = false, cellsReady = false, bodyRevealed = false
let cursorRaf = 0
let figCleanup = null, elasticCleanup = null
let cleanupFns = []

function reduceMotion () { return window.matchMedia('(prefers-reduced-motion: reduce)').matches }

function cellHtml (item, i) {
  // --ar = crop aspect (w/h); --i = index → staggered glitch-reveal delay.
  const ar = item.w && item.h ? (item.w / item.h).toFixed(4) : '0.5625'
  return (
    '<figure class="about-gallery__cell" style="--ar:' + ar + ';--i:' + i + '">' +
      '<img src="' + item.src + '" alt="" loading="lazy" decoding="async" draggable="false">' +
    '</figure>'
  )
}

// ─── Click-drag to pan (desktop nicety) ─────────────────────────────────────
function enableDrag (el) {
  let down = false, startX = 0, startScroll = 0, moved = 0
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') return
    down = true; moved = 0
    startX = e.clientX; startScroll = el.scrollLeft
    el.setPointerCapture(e.pointerId)
  })
  el.addEventListener('pointermove', (e) => {
    if (!down) return
    const dx = e.clientX - startX
    if (Math.abs(dx) > 3 && !el.classList.contains('is-dragging')) el.classList.add('is-dragging')
    moved = Math.max(moved, Math.abs(dx))
    el.scrollLeft = startScroll - dx
  })
  const end = (e) => {
    if (!down) return
    down = false
    el.classList.remove('is-dragging')
    try { el.releasePointerCapture(e.pointerId) } catch {}
  }
  el.addEventListener('pointerup', end)
  el.addEventListener('pointercancel', end)
  el.addEventListener('click', (e) => { if (moved > 4) { e.preventDefault(); e.stopPropagation() } }, true)
}

// ─── RGB-split filter for the glitch reveal (same as the Work drawer's) ──────
function ensureRgbFilter () {
  if (document.getElementById('about-rgb')) return
  rgbSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  rgbSvg.setAttribute('class', 'about-defs')
  rgbSvg.setAttribute('aria-hidden', 'true')
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

// Reveal fires once BOTH the page has entered (post-transition) and the cells
// exist — CSS handles the staggered glitch (or a plain fade under reduced-motion).
function maybeReveal () {
  if (pageEntered && cellsReady && strip) strip.classList.add('is-in')
}

// ─── Body copy entrance — the shared VHS glitch reveal (same about-glitch-in the
// photos use), replacing the old typewriter. CSS handles the animation; here we
// just flip the reveal on once the page has entered.
function revealBody () {
  if (bodyRevealed) return
  bodyRevealed = true
  const body = document.querySelector('.about__body')
  if (body) body.classList.add('is-in')
}

// ─── Custom cursor: BIAKO wordmark over the strip (fine-pointer only) ────────
function initCursor () {
  if (!strip) return
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return

  cursorEl = document.createElement('div')
  cursorEl.className = 'about-cursor'
  cursorEl.setAttribute('aria-hidden', 'true')
  cursorEl.innerHTML = '<img src="/biako-wordmark.svg" alt="">'
  document.body.appendChild(cursorEl)

  // The logo LERPS toward the pointer so it trails with lag instead of snapping
  // (same manual-lerp approach as the site cursor in shell.js; factor in the
  // 0.12–0.18 range). Only this morphed-logo state gets the delay — the base
  // .biako-cursor is untouched.
  const LERP = 0.15
  let tx = 0, ty = 0, cx = 0, cy = 0
  const paint = () => { if (cursorEl) cursorEl.style.transform = 'translate(-50%,-50%) translate(' + cx + 'px,' + cy + 'px)' }
  const draw = () => {
    cx += (tx - cx) * LERP
    cy += (ty - cy) * LERP
    paint()
    // keep animating until it has caught up, then idle (restarts on next move)
    cursorRaf = (Math.abs(tx - cx) > 0.1 || Math.abs(ty - cy) > 0.1) ? requestAnimationFrame(draw) : 0
  }
  const move = (e) => { tx = e.clientX; ty = e.clientY; if (!cursorRaf) cursorRaf = requestAnimationFrame(draw) }
  const enter = (e) => {
    tx = cx = e.clientX; ty = cy = e.clientY   // snap to entry point (no fly-in from 0,0)
    paint()
    if (cursorEl) cursorEl.classList.add('is-visible')
    strip.classList.add('cursor-logo')
  }
  const leave = () => { if (cursorEl) cursorEl.classList.remove('is-visible'); strip.classList.remove('cursor-logo') }

  strip.addEventListener('pointerenter', enter)
  strip.addEventListener('pointerleave', leave)
  strip.addEventListener('pointermove', move)
  cleanupFns.push(() => {
    strip.removeEventListener('pointerenter', enter)
    strip.removeEventListener('pointerleave', leave)
    strip.removeEventListener('pointermove', move)
    if (cursorRaf) cancelAnimationFrame(cursorRaf)
    if (cursorEl) { cursorEl.remove(); cursorEl = null }
  })
}

export function init () {
  strip = document.getElementById('about-gallery')
  if (strip) {
    enableDrag(strip)
    ensureRgbFilter()
    fetch('/about.json', { cache: 'no-cache' })
      .then(r => r.ok ? r.json() : [])
      .then(items => {
        strip.innerHTML = items.length
          ? items.map(cellHtml).join('')
          : '<p class="about-gallery__empty">No photos yet — drop images in /public/about</p>'
        cellsReady = true
        maybeReveal()
      })
      .catch(() => {})
    initCursor()
  }

  // Pixel character (flipped mirror of the home) + the elastic divider line
  // below the text — the exact portfolio ElasticLine effect (elastic-line.js).
  figCleanup = initCharacter(document.getElementById('about-figure'))
  elasticCleanup = initElasticLines(
    document.querySelectorAll('.about__divider'),
    { className: 'about-elastic-line', activeClass: 'about__divider--elastic' })
}

// Fires after the page-transition-in completes (app.js barba.hooks.after / first load).
export function entered () {
  pageEntered = true
  maybeReveal()
  revealBody()
}

export function destroy () {
  cancelAnimationFrame(cursorRaf); cursorRaf = 0
  cleanupFns.forEach(fn => fn()); cleanupFns = []
  if (figCleanup) { figCleanup(); figCleanup = null }
  if (elasticCleanup) { elasticCleanup(); elasticCleanup = null }
  if (rgbSvg) { rgbSvg.remove(); rgbSvg = null }
  pageEntered = false; cellsReady = false; bodyRevealed = false
  strip = null
}
