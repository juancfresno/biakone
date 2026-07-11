// IA EXPERIMENTS — /lab/ia.
//
// Detail view (default): one AI tag-texture experiment floats centred over the
// shared AMBIENT CRT/scanlines backdrop (crt.js), carrying the SAME cursor-driven
// 3D tilt as the home-footer tag lightbox (shared tilt.js). Navigate with
// click/tap (next), SPACE (next), and ← / → (prev / next); every switch is a VHS
// "channel-change" static cut (shared transition.js vhsCut). A global mosaic of
// ALL experiments opens with the same 3D-lightbox feel; picking one returns to the
// detail view focused on it.
//
// SPA-safe: init()/destroy() own the CRT, the tilt, and every listener.

import { createCRT, CRT_AMBIENT, CRT_AMBIENT_MOBILE } from './crt.js'
import { attachTilt, createGyroTilt } from './tilt.js'
import { vhsCut } from './transition.js'

let detail, frame, img, curEl, totalEl, hintEl, gridToggle, mosaic, mosaicGrid, mosaicClose
let crt = null, crtSrc = null
let items = []
let index = 0
let mosaicOpen = false
let switching = false
let detachTilt = null, detachMosaicTilt = null
let gyro = null, gyroAsked = false
let onKey = null

const isMobile = () => window.matchMedia('(max-width: 640px)').matches
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

// On touch devices the cursor tilt is off — drive the SAME 3D tilt from the
// gyroscope instead. iOS needs DeviceOrientationEvent.requestPermission() from a
// user gesture, so the FIRST detail tap (which also switches) requests it; if
// granted → enable. Android has no requestPermission → enabled at load. Denied /
// unsupported / reduced-motion → nothing happens (static render). No prompts.
function requestGyro () {
  if (gyroAsked || !gyro) return
  gyroAsked = true
  const DOE = window.DeviceOrientationEvent
  if (DOE && typeof DOE.requestPermission === 'function') {
    DOE.requestPermission().then(state => { if (state === 'granted') gyro.enable() }).catch(() => {})
  }
}
const norm = (i) => ((i % items.length) + items.length) % items.length

function setImage (i) {
  index = norm(i)
  img.src = items[index].src
  if (curEl) curEl.textContent = String(index + 1).padStart(2, '0')
}

// A navigation step / jump — hidden behind the VHS static cut (or instant under
// reduced-motion via vhsCut itself).
function go (target) {
  if (switching || items.length < 2) return
  switching = true
  vhsCut(() => setImage(target)).then(() => { switching = false })
}
const next = () => go(index + 1)
const prev = () => go(index - 1)

// ─── Ambient CRT backdrop (behind everything) ────────────────────────────────
function initBackdrop () {
  crt = createCRT({ zIndex: -1, tune: CRT_AMBIENT, mobileTune: CRT_AMBIENT_MOBILE })
  if (!crt) return
  crtSrc = document.createElement('div')
  crtSrc.className = 'lab-crt-src'
  crtSrc.setAttribute('aria-hidden', 'true')
  document.body.appendChild(crtSrc)
  crt.add(crtSrc)
}

// ─── Mosaic (global view) ────────────────────────────────────────────────────
function buildMosaic () {
  mosaicGrid.innerHTML = items.map((it, i) =>
    '<button class="ia-thumb" type="button" data-i="' + i + '" aria-label="Experiment ' + (i + 1) + '">' +
      '<img src="' + it.src + '" alt="" loading="lazy" decoding="async">' +
    '</button>'
  ).join('')
}
function openMosaic () {
  if (mosaicOpen) return
  mosaicOpen = true
  mosaic.hidden = false
  mosaic.setAttribute('aria-hidden', 'false')
  requestAnimationFrame(() => mosaic.classList.add('is-open'))   // 3D-lightbox scale-in
  if (!isMobile()) detachMosaicTilt = attachTilt(mosaic, mosaicGrid, { maxDeg: 7, maxTx: 18, maxTz: 26, scale: 0.02 })
}
function closeMosaic () {
  if (!mosaicOpen) return
  mosaicOpen = false
  mosaic.classList.remove('is-open')
  mosaic.setAttribute('aria-hidden', 'true')
  if (detachMosaicTilt) { detachMosaicTilt(); detachMosaicTilt = null }
  setTimeout(() => { if (!mosaicOpen) mosaic.hidden = true }, 320)
}

// ─── Listeners ────────────────────────────────────────────────────────────────
function onDetailClick () { requestGyro(); if (!mosaicOpen) next() }
function onThumbClick (e) {
  const b = e.target.closest('.ia-thumb')
  if (!b) return
  const i = Number(b.dataset.i)
  closeMosaic()
  go(i)                                              // VHS-cut to the chosen experiment
}
function handleKey (e) {
  if (mosaicOpen) { if (e.key === 'Escape') closeMosaic(); return }
  if (e.key === 'ArrowRight') { e.preventDefault(); next() }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); prev() }
  else if (e.key === ' ' || e.key === 'Spacebar') {
    if (document.activeElement === gridToggle) return   // let Space open the grid
    e.preventDefault(); next()
  }
  else if (e.key === 'Enter' && document.activeElement === detail) { next() }
}

export function init () {
  detail = document.getElementById('ia-detail')
  if (!detail) return
  frame = document.getElementById('ia-frame')
  img = document.getElementById('ia-img')
  curEl = document.getElementById('ia-cur')
  totalEl = document.getElementById('ia-total')
  hintEl = document.getElementById('ia-hint')
  gridToggle = document.getElementById('ia-grid-toggle')
  mosaic = document.getElementById('ia-mosaic')
  mosaicGrid = document.getElementById('ia-mosaic-grid')
  mosaicClose = document.getElementById('ia-mosaic-close')

  initBackdrop()
  if (hintEl) hintEl.textContent = isMobile() ? 'TAP TO SWITCH' : 'CLICK / SPACE / ← →'

  fetch('/lab/ia.json', { cache: 'no-cache' })
    .then(r => r.ok ? r.json() : [])
    .then(list => {
      items = Array.isArray(list) ? list : []
      if (!items.length) { detail.innerHTML = '<p class="ia-empty">No experiments yet — drop images in /public/lab/ia</p>'; return }
      if (totalEl) totalEl.textContent = String(items.length).padStart(2, '0')
      setImage(0)                                    // first render — no cut
      buildMosaic()
      if (!isMobile()) {
        detachTilt = attachTilt(detail, frame)                  // cursor 3D tilt (desktop)
      } else if (!reduceMotion()) {
        gyro = createGyroTilt(frame)                            // gyroscope tilt (touch)
        // Android: enable now. iOS (requestPermission exists): wait for the first tap.
        const DOE = window.DeviceOrientationEvent
        if (DOE && typeof DOE.requestPermission !== 'function') gyro.enable()
      }

      detail.addEventListener('click', onDetailClick)
      gridToggle.addEventListener('click', openMosaic)
      mosaicClose.addEventListener('click', closeMosaic)
      mosaicGrid.addEventListener('click', onThumbClick)
      onKey = handleKey
      document.addEventListener('keydown', onKey)
    })
    .catch(() => {})
}

export function destroy () {
  if (detail) detail.removeEventListener('click', onDetailClick)
  if (gridToggle) gridToggle.removeEventListener('click', openMosaic)
  if (mosaicClose) mosaicClose.removeEventListener('click', closeMosaic)
  if (mosaicGrid) mosaicGrid.removeEventListener('click', onThumbClick)
  if (onKey) document.removeEventListener('keydown', onKey)
  onKey = null
  if (detachTilt) { detachTilt(); detachTilt = null }
  if (detachMosaicTilt) { detachMosaicTilt(); detachMosaicTilt = null }
  if (gyro) { gyro.detach(); gyro = null }
  gyroAsked = false
  if (crt) { crt.destroy(); crt = null }
  if (crtSrc) { crtSrc.remove(); crtSrc = null }
  items = []; index = 0; mosaicOpen = false; switching = false
  detail = frame = img = curEl = totalEl = hintEl = gridToggle = mosaic = mosaicGrid = mosaicClose = null
}
