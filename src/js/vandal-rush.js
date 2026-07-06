// VANDAL RUSH — LAB / 01. A mobile-first pixel-art graffiti runner.
//
// Canvas 2D for the world (crisp nearest-neighbor), a DOM overlay for the HUD /
// menus. SPA-safe: init() mounts, destroy() tears everything down (rAF, every
// listener, the canvas) so it coexists cleanly with the barba page transitions.
//
// PHASE 1 — minimal playable runner: auto-scroll, the writer with RUN/JUMP/FALL/
// LAND, one obstacle (VALLA) with AABB collision, tap-to-jump + hold-for-higher,
// a DIST counter, and game over → BUSTED + RETRY. Art is still PLACEHOLDER
// (colored rects) — real sprites, tags, enemies and HEAT come in later phases.

// ─── World model ────────────────────────────────────────────────────────────
// Fixed logical HEIGHT, variable width: world height always fills the viewport
// (no letterbox on tall phones); the visible track width follows the aspect.
const VH = 640                 // logical world height (units)
const GROUND_H = 96
const GY = VH - GROUND_H        // ground top (y)
const STEP = 1000 / 60         // fixed update timestep (ms)

// Player
const PLAYER_W = 28, PLAYER_H = 32, PLAYER_X = 72
const GRAVITY = 2600           // units/s²
const JUMP_V = 720             // launch velocity
const HOLD_G = 0.42            // gravity ×factor while holding & rising (→ higher)
const HOLD_MAX = 200           // ms the hold-assist lasts
const LAND_MS = 90

// World speed (ramps up) + distance
const SPEED0 = 170, SPEED_MAX = 300, SPEED_RAMP = 5   // units/s, +/s per second
const M_PER_UNIT = 0.05        // DIST scaling (units → "meters")

// VALLA (fence / crowd barrier)
const VALLA_W = 18, VALLA_H = 44
const SPAWN_T0 = 1.4           // s before the first valla
const SPAWN_MIN = 1.0, SPAWN_RND = 0.9   // s gap between vallas (time-based → fair at any speed)

let canvas, ctx, stage
let els = {}
let raf = 0, lastT = 0, acc = 0
let dpr = 1, cssW = 0, cssH = 0, scale = 1, VW = 360
let state = 'start'            // 'start' | 'playing' | 'paused' | 'busted'
let reduce = false
let palette = {}
let best = 0

// run state
let player = null
let obstacles = []
let speed = SPEED0
let dist = 0, tags = 0, heat = 0
let spawnTimer = SPAWN_T0
let scrollX = 0               // ground stripe scroll
let holding = false, holdT = 0
let lastDistShown = -1
let onResize, onVis, onKey, onKeyUp, onPointerDown, onPointerUp, onClick

function readPalette () {
  const cs = getComputedStyle(document.body)
  const v = (name, fb) => (cs.getPropertyValue(name).trim() || fb)
  palette = {
    letterbox: '#000000',
    sky:      v('--neutral-950', '#141414'),
    wallLine: v('--neutral-900', '#242625'),
    ground:   v('--neutral-800', '#373737'),
    groundTop: v('--neutral-700', '#4A4D4B'),
    stripe:   v('--neutral-900', '#242625'),
    hoodie:   v('--neutral-800', '#373737'),
    hood:     v('--neutral-600', '#636965'),
    pack:     v('--brand-blue',  '#C6DBF9'),
    valla:    v('--neutral-500', '#8A918D'),
    vallaEdge: v('--neutral-300', '#C9C5BD'),
    ink:      v('--neutral-50',  '#F4F2EA'),
    accent:   v('--brand-yellow', '#FFFFE6'),
  }
}

// ─── Fit the canvas (DPR + safe areas handled by CSS) ────────────────────────
function fit () {
  if (!canvas) return
  dpr = Math.min(window.devicePixelRatio || 1, 2)
  const rect = canvas.getBoundingClientRect()
  cssW = Math.max(1, Math.round(rect.width))
  cssH = Math.max(1, Math.round(rect.height))
  canvas.width = Math.round(cssW * dpr)
  canvas.height = Math.round(cssH * dpr)
  scale = cssH / VH
  VW = cssW / scale
  ctx.imageSmoothingEnabled = false
}

// ─── Run setup ───────────────────────────────────────────────────────────────
function resetRun () {
  player = { y: GY - PLAYER_H, vy: 0, grounded: true, anim: 'run', landT: 0, bob: 0 }
  obstacles = []
  speed = SPEED0
  dist = 0; tags = 0; heat = 0
  spawnTimer = SPAWN_T0
  scrollX = 0
  holding = false; holdT = 0
  lastDistShown = -1
  acc = 0; lastT = 0
  syncHud(true)
}

// ─── Input: variable jump (press → launch, hold → float higher) ──────────────
function press () {
  if (state !== 'playing' || !player) return
  if (player.grounded) {
    player.vy = -JUMP_V
    player.grounded = false
    player.anim = 'jump'
    holding = true; holdT = 0
  }
}
function release () { holding = false }

// ─── Update (fixed timestep) ─────────────────────────────────────────────────
function update (dt) {
  // difficulty ramp
  speed = Math.min(SPEED_MAX, speed + SPEED_RAMP * dt)
  dist += speed * dt * M_PER_UNIT
  scrollX += speed * dt

  // player physics — reduced gravity while holding & still rising, capped by time
  if (holding) { holdT += dt * 1000; if (holdT > HOLD_MAX || player.vy >= 0) holding = false }
  const grav = (holding && player.vy < 0) ? GRAVITY * HOLD_G : GRAVITY
  player.vy += grav * dt
  player.y += player.vy * dt

  const floor = GY - PLAYER_H
  if (player.y >= floor) {
    player.y = floor
    player.vy = 0
    if (!player.grounded) { player.grounded = true; player.landT = LAND_MS }
  }
  // animation state
  if (player.grounded) {
    if (player.landT > 0) { player.landT -= dt * 1000; player.anim = 'land' }
    else { player.anim = 'run'; player.bob += speed * dt }
  } else {
    player.anim = player.vy < 0 ? 'jump' : 'fall'
  }

  // spawn vallas on a time gap (fair at any speed)
  spawnTimer -= dt
  if (spawnTimer <= 0) {
    obstacles.push({ x: VW + VALLA_W, w: VALLA_W, h: VALLA_H })
    spawnTimer = SPAWN_MIN + Math.random() * SPAWN_RND
  }

  // move, collide, cull
  const px0 = PLAYER_X, px1 = PLAYER_X + PLAYER_W
  const py0 = player.y, py1 = player.y + PLAYER_H
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const o = obstacles[i]
    o.x -= speed * dt
    const oy0 = GY - o.h
    // AABB (small forgiveness inset so a pixel-touch isn't a bust)
    if (px1 - 3 > o.x && px0 + 3 < o.x + o.w && py1 - 2 > oy0) { bust(); return }
    if (o.x + o.w < -4) obstacles.splice(i, 1)
  }

  syncHud()
}

// ─── Render ──────────────────────────────────────────────────────────────────
function render () {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = palette.letterbox
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0)

  // sky / wall
  ctx.fillStyle = palette.sky
  ctx.fillRect(0, 0, VW, VH)
  // a couple of faint wall seams for depth
  ctx.fillStyle = palette.wallLine
  for (let x = -(scrollX * 0.3 % 120); x < VW; x += 120) ctx.fillRect(Math.round(x), 60, 2, GY - 60)

  // ground
  ctx.fillStyle = palette.ground
  ctx.fillRect(0, GY, VW, GROUND_H)
  ctx.fillStyle = palette.groundTop
  ctx.fillRect(0, GY, VW, 2)
  // scrolling ground stripes → motion feedback
  ctx.fillStyle = palette.stripe
  const sw = 26
  for (let x = -(scrollX % sw); x < VW; x += sw) ctx.fillRect(Math.round(x), GY + 10, 12, 4)

  // obstacles (VALLA — barrier: frame + bars)
  for (const o of obstacles) {
    const oy = GY - o.h
    ctx.fillStyle = palette.valla
    ctx.fillRect(Math.round(o.x), oy, o.w, o.h)
    ctx.fillStyle = palette.vallaEdge
    ctx.fillRect(Math.round(o.x), oy, o.w, 3)                 // top rail
    ctx.fillRect(Math.round(o.x), oy + o.h - 3, o.w, 3)       // bottom rail
    ctx.fillStyle = palette.sky
    ctx.fillRect(Math.round(o.x) + o.w / 2 - 1, oy + 3, 2, o.h - 6) // gap between bars
  }

  // player (placeholder hooded writer — state-driven squash/stretch + run bob)
  drawPlayer()
}

function drawPlayer () {
  let w = PLAYER_W, h = PLAYER_H
  if (player.anim === 'land') { w = PLAYER_W + 4; h = PLAYER_H - 5 }        // squash
  else if (player.anim === 'jump') { w = PLAYER_W - 3; h = PLAYER_H + 4 }   // stretch
  const x = PLAYER_X + (PLAYER_W - w) / 2
  const y = player.y + PLAYER_H - h                 // feet anchored to player.y + PLAYER_H
  // hoodie body
  ctx.fillStyle = palette.hoodie
  ctx.fillRect(Math.round(x), Math.round(y), w, h)
  // hood (top third)
  ctx.fillStyle = palette.hood
  ctx.fillRect(Math.round(x), Math.round(y), w, Math.round(h * 0.34))
  // backpack accent (back/left)
  ctx.fillStyle = palette.pack
  ctx.fillRect(Math.round(x) - 3, Math.round(y + h * 0.4), 4, Math.round(h * 0.34))
  // running legs — two alternating feet
  if (player.anim === 'run') {
    const swing = Math.sin(player.bob * 0.09)
    ctx.fillStyle = palette.hoodie
    ctx.fillRect(Math.round(x) + 3, Math.round(y + h), 6, 3 + Math.round(swing * 2))
    ctx.fillRect(Math.round(x) + w - 9, Math.round(y + h), 6, 3 - Math.round(swing * 2))
  }
}

// ─── Main loop — fixed-timestep update, render every frame ───────────────────
function frame (now) {
  raf = requestAnimationFrame(frame)
  if (state === 'playing' && !document.hidden) {
    if (!lastT) lastT = now
    let delta = now - lastT
    lastT = now
    if (delta > 250) delta = 250
    acc += delta
    let guard = 0
    while (acc >= STEP && guard++ < 8) { update(STEP / 1000); acc -= STEP; if (state !== 'playing') break }
  } else {
    lastT = now; acc = 0
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
  if (stage) stage.dataset.state = s
  if (s === 'playing') { showScreen(null); if (els.hud) els.hud.setAttribute('aria-hidden', 'false') }
  else if (s === 'start')  showScreen('start')
  else if (s === 'paused') showScreen('paused')
  else if (s === 'busted') showScreen('busted')
}

function syncHud (force) {
  const d = Math.floor(dist)
  if (force || d !== lastDistShown) {
    lastDistShown = d
    if (els.dist) els.dist.textContent = String(d).padStart(3, '0') + 'M'
  }
  if (force) {
    if (els.tags) els.tags.textContent = String(tags).padStart(3, '0')
    if (els.heat) els.heat.style.setProperty('--heat', String(heat))
  }
}

function startRun () { resetRun(); setState('playing') }
function pause ()    { if (state === 'playing') setState('paused') }
function resume ()   { if (state === 'paused') setState('playing') }
function bust () {
  holding = false
  best = Math.max(best, Math.floor(dist))
  try { localStorage.setItem('vr:best', String(best)) } catch {}
  if (els.finalTags) els.finalTags.textContent = String(tags).padStart(3, '0')
  if (els.finalDist) els.finalDist.textContent = String(Math.floor(dist)).padStart(3, '0') + 'M'
  if (els.best)      els.best.textContent = String(best).padStart(3, '0') + 'M'
  setState('busted')
}

// ─── Input handlers ──────────────────────────────────────────────────────────
function onDown (e) { if (state === 'playing') { e.preventDefault(); press() } }
function onUp () { release() }
function onKeydown (e) {
  if (e.key === 'Escape') { if (state === 'playing') pause(); else if (state === 'paused') resume(); return }
  if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
    e.preventDefault()
    if (state === 'start' || state === 'busted') startRun()
    else if (state === 'playing') { if (!e.repeat) press() }
  }
}
function onKeyup (e) { if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') release() }
function onStageClick (e) {
  const t = e.target.closest('button, [data-vr-exit]')
  if (!t) return
  if (t.id === 'vr-play' || t.id === 'vr-retry') { e.preventDefault(); startRun() }
  else if (t.id === 'vr-pause') { e.preventDefault(); pause() }
  else if (t.id === 'vr-resume') { e.preventDefault(); resume() }
  // [data-vr-exit] → real <a href="/lab"> handled by barba.
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
  resetRun()
  setState('start')

  onPointerDown = onDown; onPointerUp = onUp
  onKey = onKeydown; onKeyUp = onKeyup; onClick = onStageClick
  canvas.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKeyUp)
  stage.addEventListener('click', onClick)

  onVis = () => { if (document.hidden && state === 'playing') pause() }
  onResize = () => fit()
  document.addEventListener('visibilitychange', onVis)
  window.addEventListener('resize', onResize)
  if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize)

  // Debug / tuning handle (console): vandalRush.tune, vandalRush.state, ...
  window.vandalRush = {
    get state () { return state },
    get dist () { return dist },
    get speed () { return speed },
    get obstacles () { return obstacles.length },
    get player () { return player && { y: player.y, vy: player.vy, grounded: player.grounded, anim: player.anim } },
    press, release, start: startRun,
  }

  raf = requestAnimationFrame(frame)
}

export function destroy () {
  cancelAnimationFrame(raf); raf = 0
  if (canvas && onPointerDown) canvas.removeEventListener('pointerdown', onPointerDown)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('keyup', onKeyUp)
  if (stage && onClick) stage.removeEventListener('click', onClick)
  if (onVis) document.removeEventListener('visibilitychange', onVis)
  if (onResize) {
    window.removeEventListener('resize', onResize)
    if (window.visualViewport) window.visualViewport.removeEventListener('resize', onResize)
  }
  delete window.vandalRush
  canvas = ctx = stage = player = null
  els = {}; obstacles = []
  onPointerDown = onPointerUp = onKey = onKeyUp = onClick = onVis = onResize = null
  lastT = 0; acc = 0; state = 'start'
}
