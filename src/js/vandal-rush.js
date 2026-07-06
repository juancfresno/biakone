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

// Taggable spots (wall panels / dumpsters) + HEAT
const SPOT_T0 = 2.0, SPOT_MIN = 1.6, SPOT_RND = 1.4   // s between taggable spots
const TAG_MS = 320             // player committed (jump-locked) while tagging
const TAG_HEAT = 0.16          // heat added per tag
const HEAT_DECAY = 0.055       // heat/s bled off over time
const REACH_BACK = 22, REACH_FWD = 46   // tag reach around the player (units)
// Wall spot: upper-background panel. Dumpster: ground box behind the player.
const WALL_W = 78, WALL_H = 96, WALL_Y = 150
const DUMP_W = 62, DUMP_H = 52

// ── Phase 3: enemies + HEAT consequence ──
// CCTV — wall camera with a vision cone; being in it raises HEAT (less when airborne).
const CCTV_W = 22, CCTV_H = 14, CCTV_Y = 74
const CCTV_RATE = 0.34, CCTV_RATE_AIR = 0.15   // heat/s in cone (ground vs air)
const CCTV_BACK = 10, CCTV_FWD = 46            // cone x-span around the camera (ground)
const CCTV_T0 = 3.2, CCTV_MIN = 2.8, CCTV_RND = 2.6
// Pursuer (SEGURATA/POLICÍA) — visualises HEAT: closes in from behind, catches at max.
const PURSUE_HEAT = 0.45                        // appears above this
const PURSUE_X0 = -48                           // fully-behind x at PURSUE_HEAT
const HEAT_CATCH = 0.98                         // ≥ this HEAT → caught (survives 1 frame of decay)
const CAUGHT_MS = 800                           // CAUGHT pose before BUSTED
// BUFF (rodillo) — while on screen, erases your most-recent tag.
const BUFF_W = 30, BUFF_H = 42
const BUFF_T0 = 6.5, BUFF_MIN = 5.5, BUFF_RND = 4.5
const BUFF_ERASE_T = 0.7                        // s between erases while a buff is around
// Collectibles — spray can (−HEAT) and bolsa (+1 TAG). Some spawn elevated.
const PICK_T0 = 3.0, PICK_MIN = 2.4, PICK_RND = 2.6
const PICK_R = 13
const SPRAY_COOL = 0.34

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
let spots = []
let cams = [], buffs = [], picks = []
let speed = SPEED0
let dist = 0, tags = 0, heat = 0
let spawnTimer = SPAWN_T0, spotTimer = SPOT_T0, spotFlip = 0
let camTimer = CCTV_T0, buffTimer = BUFF_T0, pickTimer = PICK_T0, buffEraseTimer = 0, pickFlip = 0
let caughtT = 0
let scrollX = 0               // ground stripe scroll
let holding = false, holdT = 0
let lastDistShown = -1, lastTagsShown = -1, lastHeatShown = -1
let onResize, onVis, onKey, onKeyUp, onPointerDown, onPointerUp, onClick, onTagDown

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
    wallSpot: v('--neutral-900', '#242625'),
    wallSpotEdge: v('--neutral-700', '#4A4D4B'),
    dumpster: v('--neutral-700', '#4A4D4B'),
    dumpLid:  v('--brand-green', '#8DF8CD'),
    tagInk:   v('--brand-blue',  '#C6DBF9'),
    reach:    v('--brand-yellow', '#FFFFE6'),
    ink:      v('--neutral-50',  '#F4F2EA'),
    accent:   v('--brand-yellow', '#FFFFE6'),
    // Phase 3
    cam:      v('--neutral-600', '#636965'),
    cone:     v('--feedback-error', '#E0655A'),
    cop:      v('--brand-blue-800', '#2E4178'),
    copHi:    v('--brand-blue',  '#C6DBF9'),
    buff:     v('--feedback-error', '#E0655A'),   // orange-ish vest (error red = closest token)
    buffed:   v('--neutral-600', '#636965'),
    spray:    v('--brand-blue',  '#C6DBF9'),
    bag:      v('--brand-green', '#8DF8CD'),
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
  player = { y: GY - PLAYER_H, vy: 0, grounded: true, anim: 'run', landT: 0, bob: 0, tagT: 0 }
  obstacles = []
  spots = []
  cams = []; buffs = []; picks = []
  speed = SPEED0
  dist = 0; tags = 0; heat = 0
  spawnTimer = SPAWN_T0; spotTimer = SPOT_T0; spotFlip = 0
  camTimer = CCTV_T0; buffTimer = BUFF_T0; pickTimer = PICK_T0; buffEraseTimer = 0; pickFlip = 0
  caughtT = 0
  scrollX = 0
  holding = false; holdT = 0
  lastDistShown = -1; lastTagsShown = -1; lastHeatShown = -1
  acc = 0; lastT = 0
  syncHud(true)
}

// ─── Input: variable jump (press → launch, hold → float higher) ──────────────
function press () {
  if (state !== 'playing' || !player) return
  if (player.grounded && player.tagT <= 0) {     // can't jump mid-tag (the trade-off)
    player.vy = -JUMP_V
    player.grounded = false
    player.anim = 'jump'
    holding = true; holdT = 0
  }
}
function release () { holding = false }

// Tag the nearest untagged surface in reach → +TAGS, +HEAT, commit to the pose.
function tag () {
  if (state !== 'playing' || !player || player.tagT > 0) return
  const pcx = PLAYER_X + PLAYER_W / 2
  const z0 = PLAYER_X - REACH_BACK, z1 = PLAYER_X + PLAYER_W + REACH_FWD
  let target = null, bestDx = Infinity
  for (const s of spots) {
    if (s.tagged) continue
    if (s.x + s.w > z0 && s.x < z1) {
      const dx = Math.abs(s.x + s.w / 2 - pcx)
      if (dx < bestDx) { bestDx = dx; target = s }
    }
  }
  if (!target) return                            // whiff — nothing in reach
  target.tagged = true
  target.seed = Math.random()                    // vary the placeholder scribble
  tags++
  heat = Math.min(1, heat + TAG_HEAT)
  player.anim = 'tag'; player.tagT = TAG_MS       // committed (jump-locked)
  syncHud(true)
}

// ─── Update (fixed timestep) ─────────────────────────────────────────────────
function update (dt) {
  // CAUGHT — the pursuer has you: freeze the world for the CAUGHT pose, then BUSTED.
  if (caughtT > 0) { caughtT -= dt * 1000; player.anim = 'caught'; if (caughtT <= 0) bust(); syncHud(); return }

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
  // timers (tag pose + landing squash)
  if (player.tagT > 0) player.tagT -= dt * 1000
  if (player.landT > 0) player.landT -= dt * 1000

  // animation state — priority: tag > airborne > land > run
  if (player.tagT > 0) player.anim = 'tag'
  else if (!player.grounded) player.anim = player.vy < 0 ? 'jump' : 'fall'
  else if (player.landT > 0) player.anim = 'land'
  else { player.anim = 'run'; player.bob += speed * dt }

  // HEAT bleeds off over time (tagging spikes it)
  heat = Math.max(0, heat - HEAT_DECAY * dt)

  // spawn vallas on a time gap (fair at any speed)
  spawnTimer -= dt
  if (spawnTimer <= 0) {
    obstacles.push({ x: VW + VALLA_W, w: VALLA_W, h: VALLA_H })
    spawnTimer = SPAWN_MIN + Math.random() * SPAWN_RND
  }
  // spawn taggable spots — alternating wall panel / dumpster
  spotTimer -= dt
  if (spotTimer <= 0) {
    spotFlip ^= 1
    spots.push(spotFlip
      ? { kind: 'wall',     x: VW + WALL_W, y: WALL_Y,      w: WALL_W, h: WALL_H, tagged: false, seed: 0 }
      : { kind: 'dumpster', x: VW + DUMP_W, y: GY - DUMP_H, w: DUMP_W, h: DUMP_H, tagged: false, seed: 0 })
    spotTimer = SPOT_MIN + Math.random() * SPOT_RND
  }

  // move + collide + cull obstacles (vallas are lethal)
  const px0 = PLAYER_X, px1 = PLAYER_X + PLAYER_W, py1 = player.y + PLAYER_H
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const o = obstacles[i]
    o.x -= speed * dt
    if (px1 - 3 > o.x && px0 + 3 < o.x + o.w && py1 - 2 > GY - o.h) { bust(); return }
    if (o.x + o.w < -4) obstacles.splice(i, 1)
  }
  // move + cull spots (non-lethal tag targets)
  for (let i = spots.length - 1; i >= 0; i--) {
    spots[i].x -= speed * dt
    if (spots[i].x + spots[i].w < -8) spots.splice(i, 1)
  }

  // ── CCTV: spawn, move; the cone heats you (much less while airborne) ──
  const pcx = PLAYER_X + PLAYER_W / 2
  camTimer -= dt
  if (camTimer <= 0) { cams.push({ x: VW + CCTV_W }); camTimer = CCTV_MIN + Math.random() * CCTV_RND }
  for (let i = cams.length - 1; i >= 0; i--) {
    const c = cams[i]
    c.x -= speed * dt
    if (pcx > c.x - CCTV_BACK && pcx < c.x + CCTV_FWD) {
      heat = Math.min(1, heat + (player.grounded ? CCTV_RATE : CCTV_RATE_AIR) * dt)
    }
    if (c.x + CCTV_FWD < -6) cams.splice(i, 1)
  }

  // ── BUFF: while any is on screen, periodically erase your freshest tag ──
  buffTimer -= dt
  if (buffTimer <= 0) { buffs.push({ x: VW + BUFF_W }); buffTimer = BUFF_MIN + Math.random() * BUFF_RND }
  for (let i = buffs.length - 1; i >= 0; i--) {
    buffs[i].x -= speed * dt
    if (buffs[i].x + BUFF_W < -6) buffs.splice(i, 1)
  }
  if (buffs.length) {
    buffEraseTimer -= dt
    if (buffEraseTimer <= 0) {
      buffEraseTimer = BUFF_ERASE_T
      let t = null
      for (const s of spots) { if (s.tagged && s.x + s.w > 0 && s.x < VW && (!t || s.x > t.x)) t = s }
      if (t) { t.tagged = false; t.buffed = true; if (tags > 0) tags-- }
    }
  } else buffEraseTimer = 0

  // ── Collectibles: spray (−HEAT) / bolsa (+1 TAG), collect on overlap ──
  pickTimer -= dt
  if (pickTimer <= 0) {
    pickFlip ^= 1
    const y = Math.random() < 0.5 ? GY - PLAYER_H - 92 - Math.random() * 44 : GY - PLAYER_H - 4
    picks.push({ kind: pickFlip ? 'spray' : 'bag', x: VW + PICK_R, y })
    pickTimer = PICK_MIN + Math.random() * PICK_RND
  }
  const qy0 = player.y, qy1 = player.y + PLAYER_H
  for (let i = picks.length - 1; i >= 0; i--) {
    const p = picks[i]
    p.x -= speed * dt
    if (px1 > p.x - PICK_R && px0 < p.x + PICK_R && qy1 > p.y - PICK_R && qy0 < p.y + PICK_R) {
      if (p.kind === 'spray') heat = Math.max(0, heat - SPRAY_COOL)
      else tags++
      picks.splice(i, 1); continue
    }
    if (p.x + PICK_R < -6) picks.splice(i, 1)
  }

  // HEAT maxed → the pursuer catches you.
  if (heat >= HEAT_CATCH) { triggerCaught(); syncHud(); return }

  syncHud()
}

function triggerCaught () {
  heat = 1
  caughtT = CAUGHT_MS
  player.anim = 'caught'
  holding = false
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

  // CCTV cameras + vision cones (danger zones)
  drawCams()

  // taggable spots (behind the player) — walls + dumpsters, tags + reach prompt
  drawSpots()

  // collectibles + buff workers (behind the player)
  drawPicks()
  drawBuffs()

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

  // pursuer (SEGURATA/POLICÍA) — closes in with HEAT, grabs you on CAUGHT
  drawPursuer()
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
  // TAG pose — a spray burst thrown forward
  if (player.anim === 'tag') {
    ctx.fillStyle = palette.tagInk
    const fx = Math.round(x) + w + 1, fy = Math.round(y + h * 0.3)
    ctx.fillRect(fx, fy, 3, 3)
    ctx.fillRect(fx + 3, fy - 3, 2, 2)
    ctx.fillRect(fx + 3, fy + 4, 2, 2)
    ctx.fillRect(fx + 5, fy + 1, 2, 2)
  }
  // CAUGHT — an alarm "!" over the writer
  if (player.anim === 'caught') {
    ctx.fillStyle = palette.cone
    const mx = Math.round(x) + Math.round(w / 2) - 1
    ctx.fillRect(mx, Math.round(y) - 13, 2, 7)
    ctx.fillRect(mx, Math.round(y) - 4, 2, 2)
  }
}

// CCTV — housing + red lens + translucent vision cone to the ground.
function drawCams () {
  for (const c of cams) {
    const cx = Math.round(c.x)
    ctx.globalAlpha = 0.14; ctx.fillStyle = palette.cone
    ctx.beginPath()
    ctx.moveTo(cx + 2, CCTV_Y + CCTV_H)
    ctx.lineTo(cx - CCTV_BACK, GY)
    ctx.lineTo(cx + CCTV_FWD, GY)
    ctx.lineTo(cx + CCTV_W - 2, CCTV_Y + CCTV_H)
    ctx.closePath(); ctx.fill()
    ctx.globalAlpha = 1
    ctx.fillStyle = palette.cam
    ctx.fillRect(cx + CCTV_W - 3, CCTV_Y - 6, 3, 6)          // mount
    ctx.fillRect(cx, CCTV_Y, CCTV_W, CCTV_H)                 // housing
    ctx.fillStyle = palette.cone
    ctx.fillRect(cx + 1, CCTV_Y + 4, 4, 4)                   // lens
  }
}

// Collectibles — spray can (−HEAT) / bolsa (+1 TAG), with a glint.
function drawPicks () {
  for (const p of picks) {
    const x = Math.round(p.x), y = Math.round(p.y)
    if (p.kind === 'spray') {
      ctx.fillStyle = palette.spray; ctx.fillRect(x - 5, y - 8, 10, 16)
      ctx.fillStyle = palette.ink;   ctx.fillRect(x - 3, y - 12, 6, 4)
    } else {
      ctx.fillStyle = palette.bag; ctx.fillRect(x - 7, y - 6, 14, 14)
      ctx.fillStyle = palette.sky; ctx.fillRect(x - 3, y - 9, 6, 3)
    }
    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(scrollX * 0.09)
    ctx.fillStyle = palette.accent; ctx.fillRect(x + 6, y - 10, 2, 2)
    ctx.globalAlpha = 1
  }
}

// BUFF worker (rodillo) — vest + head + roller.
function drawBuffs () {
  for (const b of buffs) {
    const x = Math.round(b.x), y = GY - BUFF_H
    ctx.fillStyle = palette.buff;   ctx.fillRect(x, y + 10, BUFF_W - 8, BUFF_H - 10)
    ctx.fillStyle = palette.hood;   ctx.fillRect(x + 4, y, BUFF_W - 16, 10)
    ctx.fillStyle = palette.ink;    ctx.fillRect(x + BUFF_W - 8, y + 4, 8, 3)   // handle
    ctx.fillStyle = palette.buffed; ctx.fillRect(x + BUFF_W - 2, y - 2, 6, 12)  // roller pad
  }
}

// Pursuer — SEGURATA/POLICÍA. Position tracks HEAT (0.45 behind → 1.0 on you).
function drawPursuer () {
  if (caughtT <= 0 && heat < PURSUE_HEAT) return
  const t = caughtT > 0 ? 1 : Math.min(1, (heat - PURSUE_HEAT) / (1 - PURSUE_HEAT))
  const x = Math.round(PURSUE_X0 + (PLAYER_X - PURSUE_X0) * t)
  const y = GY - PLAYER_H
  const sw = Math.sin(scrollX * 0.13)
  ctx.fillStyle = palette.cop;   ctx.fillRect(x, y, PLAYER_W, PLAYER_H)
  ctx.fillStyle = palette.copHi; ctx.fillRect(x, y, PLAYER_W, Math.round(PLAYER_H * 0.3))   // cap
  ctx.fillStyle = palette.cop
  ctx.fillRect(x + 3, y + PLAYER_H, 6, 3 + Math.round(sw * 2))
  ctx.fillRect(x + PLAYER_W - 9, y + PLAYER_H, 6, 3 - Math.round(sw * 2))
}

// Taggable surfaces — wall panels / dumpsters, their BIAKO tags, reach prompt.
function drawSpots () {
  const z0 = PLAYER_X - REACH_BACK, z1 = PLAYER_X + PLAYER_W + REACH_FWD
  for (const s of spots) {
    const x = Math.round(s.x)
    if (s.kind === 'wall') {
      ctx.fillStyle = palette.wallSpot
      ctx.fillRect(x, s.y, s.w, s.h)
      ctx.strokeStyle = palette.wallSpotEdge; ctx.lineWidth = 1
      ctx.strokeRect(x + 0.5, s.y + 0.5, s.w - 1, s.h - 1)
    } else {
      ctx.fillStyle = palette.dumpster
      ctx.fillRect(x, s.y, s.w, s.h)
      ctx.fillStyle = palette.dumpLid
      ctx.fillRect(x, s.y, s.w, 6)                     // lid
      ctx.fillStyle = palette.wallLine
      ctx.fillRect(x + 6, GY - 2, 6, 4)               // wheels
      ctx.fillRect(x + s.w - 12, GY - 2, 6, 4)
    }
    if (s.tagged) { drawTag(s); continue }
    if (s.buffed) {                                    // erased by a buff → grey smear
      ctx.globalAlpha = 0.7; ctx.fillStyle = palette.buffed
      ctx.fillRect(Math.round(s.x + s.w * 0.16), Math.round(s.y + s.h * 0.34), Math.round(s.w * 0.68), Math.round(s.h * 0.3))
      ctx.globalAlpha = 1
      continue
    }
    // reach prompt — a pulsing down-caret above a taggable surface
    if (s.x + s.w > z0 && s.x < z1) {
      ctx.globalAlpha = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(scrollX * 0.06))
      ctx.fillStyle = palette.reach
      const cx = Math.round(s.x + s.w / 2)
      ctx.fillRect(cx - 5, s.y - 13, 10, 2)
      ctx.beginPath(); ctx.moveTo(cx - 5, s.y - 9); ctx.lineTo(cx + 5, s.y - 9); ctx.lineTo(cx, s.y - 3); ctx.closePath(); ctx.fill()
      ctx.globalAlpha = 1
    }
  }
}

// Placeholder BIAKO tag stamped on a surface (real graffiti art comes later).
function drawTag (s) {
  ctx.save()
  ctx.translate(s.x + s.w / 2, s.y + s.h / 2)
  ctx.rotate(-0.1 + (s.seed - 0.5) * 0.18)
  ctx.fillStyle = palette.tagInk
  ctx.font = '700 ' + Math.round(s.w * 0.2) + 'px "Geist Mono", monospace'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText('BIAKO', 0, 0)
  ctx.strokeStyle = palette.tagInk; ctx.lineWidth = 2
  const tw = s.w * 0.4
  ctx.beginPath(); ctx.moveTo(-tw, s.h * 0.2); ctx.quadraticCurveTo(0, s.h * 0.28, tw, s.h * 0.16); ctx.stroke()
  ctx.restore()
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
  if (els.controls) els.controls.setAttribute('aria-hidden', s === 'playing' ? 'false' : 'true')
}

function syncHud (force) {
  const d = Math.floor(dist)
  if (force || d !== lastDistShown) { lastDistShown = d; if (els.dist) els.dist.textContent = String(d).padStart(3, '0') + 'M' }
  if (force || tags !== lastTagsShown) { lastTagsShown = tags; if (els.tags) els.tags.textContent = String(tags).padStart(3, '0') }
  if (force || Math.abs(heat - lastHeatShown) > 0.02) { lastHeatShown = heat; if (els.heat) els.heat.style.setProperty('--heat', heat.toFixed(3)) }
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
  if (e.key === 'f' || e.key === 'F' || e.key === 'k' || e.key === 'K' || e.key === 'ArrowDown') {
    e.preventDefault(); if (state === 'playing' && !e.repeat) tag(); return
  }
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
    controls: document.getElementById('vr-controls'),
    tag: document.getElementById('vr-tag'),
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
  onTagDown = (e) => { e.preventDefault(); tag() }   // pointerdown = responsive tag
  canvas.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKeyUp)
  stage.addEventListener('click', onClick)
  if (els.tag) els.tag.addEventListener('pointerdown', onTagDown)

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
    get obstaclePos () { return obstacles.map(o => Math.round(o.x)) },
    get spots () { return spots.map(s => ({ kind: s.kind, x: Math.round(s.x), w: s.w, tagged: s.tagged, buffed: !!s.buffed })) },
    get tags () { return tags },
    get heat () { return heat },
    get cams () { return cams.map(c => Math.round(c.x)) },
    get buffs () { return buffs.length },
    get picks () { return picks.map(p => ({ kind: p.kind, x: Math.round(p.x), y: Math.round(p.y) })) },
    get caughtT () { return caughtT },
    get player () { return player && { y: player.y, vy: player.vy, grounded: player.grounded, anim: player.anim, tagT: player.tagT } },
    setHeat (v) { heat = Math.max(0, Math.min(1, v)) },   // dev only
    press, release, tag, start: startRun,
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
  if (els.tag && onTagDown) els.tag.removeEventListener('pointerdown', onTagDown)
  if (onVis) document.removeEventListener('visibilitychange', onVis)
  if (onResize) {
    window.removeEventListener('resize', onResize)
    if (window.visualViewport) window.visualViewport.removeEventListener('resize', onResize)
  }
  delete window.vandalRush
  canvas = ctx = stage = player = null
  els = {}; obstacles = []; spots = []
  onPointerDown = onPointerUp = onKey = onKeyUp = onClick = onVis = onResize = onTagDown = null
  lastT = 0; acc = 0; state = 'start'
}
