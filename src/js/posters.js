// Posters page module (route /posters) — a full-viewport poster slideshow.
//
// One image covers the viewport; the shared shell (fixed nav/footer) floats on
// top. Auto-advances every 6s with the shared VHS glitch (about-glitch-in +
// #about-rgb — the same transition Work/Home use, not a new effect). The bottom
// progress line fills 0→100% over each interval and drives the advance, so the
// two stay perfectly in sync; pausing the line (tab hidden) pauses the advance
// with no drift. SPA-safe: init() mounts, destroy() tears everything down.

let stage = null, img = null, progress = null, rgbSvg = null
let posters = [], i = 0
let onVis = null, onEnd = null

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Shared RGB-split filter for the glitch (same def as About/Work/Home). Injected
// only if absent; removed on destroy when WE created it.
function ensureRgbFilter () {
  if (document.getElementById('about-rgb')) return
  rgbSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  rgbSvg.setAttribute('class', 'about-defs')
  rgbSvg.setAttribute('aria-hidden', 'true')
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

// Restart the bottom progress fill (0→100% over the CSS interval). Its
// animationend drives the next advance. Respects the current tab visibility.
function restartProgress () {
  if (!progress) return
  progress.classList.remove('is-running')
  void progress.offsetWidth                 // reflow → restart the animation
  progress.style.animationPlayState = document.hidden ? 'paused' : 'running'
  progress.classList.add('is-running')
}

// Swap to poster `idx` — preload, then set src + glitch + restart the clock.
function swapTo (idx) {
  const src = posters[idx] && posters[idx].src
  if (!src || !img) return
  const pre = new Image()
  const apply = () => {
    img.src = src
    if (!reduceMotion()) {
      img.classList.remove('is-glitch')
      void img.offsetWidth
      img.classList.add('is-glitch')
    }
    restartProgress()
  }
  pre.onload = apply; pre.onerror = apply; pre.src = src
}

function advance () {
  if (posters.length < 2) { restartProgress(); return }   // single poster → just re-clock
  i = (i + 1) % posters.length
  swapTo(i)
}

export function init () {
  stage    = document.getElementById('posters-stage')
  img      = stage && stage.querySelector('.posters__img')
  progress = document.getElementById('posters-progress')
  if (!img) return

  ensureRgbFilter()

  // Pause the clock (and thus the advance) while the tab is hidden — no drift.
  onVis = () => { if (progress) progress.style.animationPlayState = document.hidden ? 'paused' : 'running' }
  document.addEventListener('visibilitychange', onVis)

  // The advance is driven by the progress line finishing.
  onEnd = () => advance()
  if (progress) progress.addEventListener('animationend', onEnd)

  fetch('/posters.json', { cache: 'no-cache' })
    .then(r => r.ok ? r.json() : [])
    .then(items => {
      posters = (Array.isArray(items) ? items : []).filter(p => p && p.src)
      if (!posters.length) return
      i = 0
      img.src = posters[0].src        // first poster (no glitch — the page already glitched in)
      restartProgress()               // start the 6s clock
    })
    .catch(() => {})
}

export function destroy () {
  if (onVis) document.removeEventListener('visibilitychange', onVis)
  if (progress && onEnd) progress.removeEventListener('animationend', onEnd)
  if (rgbSvg) { rgbSvg.remove(); rgbSvg = null }
  posters = []; i = 0
  stage = img = progress = onVis = onEnd = null
}
