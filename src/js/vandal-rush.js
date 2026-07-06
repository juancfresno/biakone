// VANDAL RUSH — LAB / 01. A mobile-first pixel-art graffiti runner.
//
// Canvas 2D for the world (crisp nearest-neighbor), a DOM overlay for the HUD /
// menus. SPA-safe: init() mounts, destroy() tears everything down (rAF, every
// listener, the canvas) so it coexists cleanly with the barba page transitions.
//
// PHASE 0 — scaffolding only: no gameplay yet. Proves the mount/unmount, the
// DPR + resize + safe-area fit, the fixed-timestep loop with pause (tab hidden /
// navigate away), the input plumbing, portrait scaling and the state machine
// (start · playing · paused · busted). The world renders a placeholder scene
// (ground + a colored-rect writer). Real sprites + gameplay land in Phase 1+.

// ─── World model ────────────────────────────────────────────────────────────
// Fixed logical HEIGHT, variable width: the world height always fills the
// viewport (no letterbox on tall phones) and the visible track width adapts to
// the screen aspect. All gameplay units are in this logical space.
const VH = 640                 // logical world height (units)
const GROUND_H = 96            // ground band height (units)
const PLAYER_W = 28, PLAYER_H = 32   // reference sprite size (28x32)
const STEP = 1000 / 60         // fixed update timestep (ms)

let canvas, ctx, stage
let els = {}                   // cached HUD / screen nodes
let raf = 0, lastT = 0, acc = 0
let dpr = 1, cssW = 0, cssH = 0, scale = 1, VW = 360
let state = 'start'            // 'start' | 'playing' | 'paused' | 'busted'
let reduce = false
let palette = {}
let best = 0
// run state (Phase 1 fills these in)
let dist = 0, tags = 0, heat = 0
let onResize, onVis, onKey, onPointer, onClick

function readPalette () {
  const cs = getComputedStyle(document.body)
  const v = (name, fb) => (cs.getPropertyValue(name).trim() || fb)
  palette = {
    letterbox: '#000000',
    sky:    v('--neutral-950', '#141414'),
    ground: v('--neutral-800', '#373737'),
    groundLine: v('--neutral-700', '#4A4D4B'),
    player: v('--brand-blue', '#C6DBF9'),
    ink:    v('--neutral-50', '#F4F2EA'),
    accent: v('--brand-yellow', '#FFFFE6'),
  }
}

// ─── Fit the canvas to its box (DPR + safe areas handled by CSS) ─────────────
function fit () {
  if (!canvas) return
  dpr = Math.min(window.devicePixelRatio || 1, 2)
  const rect = canvas.getBoundingClientRect()
  cssW = Math.max(1, Math.round(rect.width))
  cssH = Math.max(1, Math.round(rect.height))
  canvas.width = Math.round(cssW * dpr)
  canvas.height = Math.round(cssH * dpr)
  scale = cssH / VH                 // world height fills the viewport
  VW = cssW / scale                 // logical width follows the aspect
  ctx.imageSmoothingEnabled = false // crisp pixels
}

// ─── Render (placeholder for Phase 0) ────────────────────────────────────────
function render () {
  // reset + letterbox clear (device space)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = palette.letterbox
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // world space: (0..VW, 0..VH) → full canvas
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0)

  // sky / wall
  ctx.fillStyle = palette.sky
  ctx.fillRect(0, 0, VW, VH)

  // ground band
  const gy = VH - GROUND_H
  ctx.fillStyle = palette.ground
  ctx.fillRect(0, gy, VW, GROUND_H)
  ctx.fillStyle = palette.groundLine
  ctx.fillRect(0, gy, VW, 2)

  // placeholder "writer" — a colored rect standing on the ground
  ctx.fillStyle = palette.player
  ctx.fillRect(48, gy - PLAYER_H, PLAYER_W, PLAYER_H)

  // scaffolding label (centred so it never fights the HUD; removed in Phase 1)
  ctx.fillStyle = palette.ink
  ctx.font = '10px "Geist Mono", monospace'
  ctx.textAlign = 'center'
  ctx.globalAlpha = 0.4
  ctx.fillText('PHASE 0 — SCAFFOLDING', VW / 2, VH * 0.42)
  ctx.globalAlpha = 1
}

// ─── Update (empty in Phase 0 — gameplay arrives in Phase 1) ─────────────────
function update (/* dt */) { /* Phase 1: scroll, player physics, spawns */ }

// ─── Main loop — fixed-timestep update, render every frame ───────────────────
function frame (now) {
  raf = requestAnimationFrame(frame)
  if (state === 'playing' && !document.hidden) {
    if (!lastT) lastT = now
    let delta = now - lastT
    lastT = now
    if (delta > 250) delta = 250          // clamp after a tab switch / hitch
    acc += delta
    while (acc >= STEP) { update(STEP / 1000); acc -= STEP }
  } else {
    lastT = now                            // frozen: don't accumulate time
    acc = 0
  }
  render()
}

// ─── State machine ───────────────────────────────────────────────────────────
function showScreen (name) {
  for (const key of ['start', 'paused', 'busted']) {
    const el = els[key]
    if (el) el.hidden = key !== name
  }
  if (els.hud) els.hud.setAttribute('aria-hidden', name ? 'true' : 'false')
}
function setState (s) {
  state = s
  stage.dataset.state = s
  if (s === 'playing') { showScreen(null); if (els.hud) els.hud.setAttribute('aria-hidden', 'false') }
  else if (s === 'start')  showScreen('start')
  else if (s === 'paused') showScreen('paused')
  else if (s === 'busted') showScreen('busted')
}

function resetRun () {
  dist = 0; tags = 0; heat = 0; acc = 0; lastT = 0
  syncHud()
}
function syncHud () {
  if (els.tags) els.tags.textContent = String(tags).padStart(3, '0')
  if (els.dist) els.dist.textContent = String(Math.floor(dist)).padStart(3, '0') + 'M'
  if (els.heat) els.heat.style.setProperty('--heat', String(heat))
}

function startRun () { resetRun(); setState('playing') }
function pause ()    { if (state === 'playing') setState('paused') }
function resume ()   { if (state === 'paused') setState('playing') }
// Phase 1 calls this on collision; wired now so the flow is testable.
function bust () {
  best = Math.max(best, Math.floor(dist))
  try { localStorage.setItem('vr:best', String(best)) } catch {}
  if (els.finalTags) els.finalTags.textContent = String(tags).padStart(3, '0')
  if (els.finalDist) els.finalDist.textContent = String(Math.floor(dist)).padStart(3, '0') + 'M'
  if (els.best)      els.best.textContent = String(best).padStart(3, '0') + 'M'
  setState('busted')
}

// ─── Input ───────────────────────────────────────────────────────────────────
// Phase 0: the "jump" is plumbed but does nothing yet; menu buttons drive the
// state flow so the whole shell is exercised on device.
function jump () { /* Phase 1: player.vy = -JUMP */ }

function onCanvasPointer (e) {
  if (state !== 'playing') return
  e.preventDefault()
  jump()
}
function onKeydown (e) {
  if (e.key === 'Escape') { state === 'playing' ? pause() : state === 'paused' && resume(); return }
  if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') {
    if (state === 'start' || state === 'busted') { e.preventDefault(); startRun() }
    else if (state === 'playing') { e.preventDefault(); jump() }
  }
}
function onStageClick (e) {
  const t = e.target.closest('button, [data-vr-exit]')
  if (!t) return
  if (t.id === 'vr-play' || t.id === 'vr-retry') { e.preventDefault(); startRun() }
  else if (t.id === 'vr-pause') { e.preventDefault(); pause() }
  else if (t.id === 'vr-resume') { e.preventDefault(); resume() }
  // [data-vr-exit] links (← LAB / EXIT / MENU) are real <a href="/lab"> → barba navigates.
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────
export function init () {
  stage  = document.getElementById('vr-stage')
  canvas = document.getElementById('vr-canvas')
  if (!stage || !canvas) return
  ctx = canvas.getContext('2d')
  reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  els = {
    hud: document.getElementById('vr-hud'),
    tags: document.getElementById('vr-tags'),
    dist: document.getElementById('vr-dist'),
    heat: document.getElementById('vr-heat'),
    start: document.getElementById('vr-start'),
    paused: document.getElementById('vr-paused'),
    busted: document.getElementById('vr-busted'),
    finalTags: document.getElementById('vr-final-tags'),
    finalDist: document.getElementById('vr-final-dist'),
    best: document.getElementById('vr-best'),
  }
  try { best = parseInt(localStorage.getItem('vr:best') || '0', 10) || 0 } catch { best = 0 }
  if (els.best) els.best.textContent = String(best).padStart(3, '0') + 'M'

  readPalette()
  fit()
  setState('start')
  syncHud()

  // Input
  onPointer = onCanvasPointer
  onKey = onKeydown
  onClick = onStageClick
  canvas.addEventListener('pointerdown', onPointer)
  window.addEventListener('keydown', onKey)
  stage.addEventListener('click', onClick)

  // Pause when the tab is hidden; refit on resize / mobile chrome changes.
  onVis = () => { if (document.hidden && state === 'playing') pause() }
  onResize = () => fit()
  document.addEventListener('visibilitychange', onVis)
  window.addEventListener('resize', onResize)
  if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize)

  // Start the render loop (renders the start screen; update() only runs in play).
  raf = requestAnimationFrame(frame)
}

export function destroy () {
  cancelAnimationFrame(raf); raf = 0
  if (canvas && onPointer) canvas.removeEventListener('pointerdown', onPointer)
  if (onKey) window.removeEventListener('keydown', onKey)
  if (stage && onClick) stage.removeEventListener('click', onClick)
  if (onVis) document.removeEventListener('visibilitychange', onVis)
  if (onResize) {
    window.removeEventListener('resize', onResize)
    if (window.visualViewport) window.visualViewport.removeEventListener('resize', onResize)
  }
  canvas = ctx = stage = null
  els = {}
  onPointer = onKey = onClick = onVis = onResize = null
  lastT = 0; acc = 0; state = 'start'
}
