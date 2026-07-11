// TAGS — true 3D infinite canvas (/lab/tags).
//
// Ported from Codrops "Infinite Canvas: Building a Seamless, Pan-Anywhere Image
// Space" (tympanus.net, 2026-01-07), in PLAIN Three.js: tags are distributed
// across cubic CHUNKS in 3D space and streamed in a fixed neighbourhood around
// the camera. Each chunk's layout is DETERMINISTIC (seeded by its coords) so it
// recreates identically after being culled — travel is unbounded, cost is
// constant. Pan on X/Y (drag), fly-through on Z (wheel / pinch), all inertia-
// driven; planes fade by grid- AND depth-distance so they appear/disappear
// gracefully (and are culled from drawing once invisible). A finite tag set
// repeats via modulo, so it reads as endless.
//
// The AMBIENT CRT/scanlines backdrop (crt.js) shows through the transparent WebGL
// canvas; nav/footer sit above. SPA-safe: destroy() disposes every geometry,
// material, texture and the renderer, cancels the rAF and kills all listeners —
// no GPU-memory creep across repeated visits.

import * as THREE from 'three'
import { createCRT, CRT_AMBIENT, CRT_AMBIENT_MOBILE } from './crt.js'

// ── Tunables ──────────────────────────────────────────────────────────────
const CHUNK = 40                // cubic chunk edge (world units)
const PER_CHUNK = 6             // tags per chunk
const RENDER_DIST = 1           // 3×3×3 active neighbourhood around the camera
const SIZE_MIN = 9, SIZE_MAX = 20
const HFADE_START = 22, HFADE_END = 40    // xy fade (< CHUNK → faded before cull, no pop)
const ZFADE_START = 18, ZFADE_END = 40    // depth fade (< CHUNK, same reason)
const INVIS = 0.02              // opacity below which a mesh stops drawing
const VEL_LERP = 0.12, VEL_DECAY = 0.9    // inertia
const DRAG_ACCEL = 0.05, ZOOM_ACCEL = 0.012, PINCH_ACCEL = 0.05
const FADE_LERP = 0.16

// Deterministic PRNG (mulberry32) + a small integer hash of chunk coords.
function hash3 (x, y, z) {
  let h = 2166136261 >>> 0
  for (const v of [x, y, z]) { h = Math.imul(h ^ (v & 0xffff), 16777619); h = Math.imul(h ^ ((v >> 16) & 0xffff), 16777619) }
  return h >>> 0
}
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
let renderer = null, scene = null, camera = null, unitGeo = null
let textures = []               // { texture, aspect }
let chunks = new Map()          // key → { meshes: [] }
let raf = 0, winW = 0, winH = 0
let reduce = false, revealed = false
const vel = { x: 0, y: 0, z: 0 }
const tvel = { x: 0, y: 0, z: 0 }
const pointers = new Map()
let dragLast = null, pinchLast = 0
let onDown, onMove, onUp, onWheel, onResize

// ── Chunk streaming ──────────────────────────────────────────────────────────
function layout (cx, cy, cz) {
  const rnd = mulberry32(hash3(cx, cy, cz))
  const out = []
  for (let i = 0; i < PER_CHUNK; i++) {
    out.push({
      x: cx * CHUNK + rnd() * CHUNK,
      y: cy * CHUNK + rnd() * CHUNK,
      z: cz * CHUNK + rnd() * CHUNK,
      size: SIZE_MIN + rnd() * (SIZE_MAX - SIZE_MIN),
      rot: (rnd() - 0.5) * 0.5,
      media: Math.floor(rnd() * textures.length),
    })
  }
  return out
}
function createChunk (cx, cy, cz, key) {
  const meshes = []
  for (const p of layout(cx, cy, cz)) {
    const t = textures[p.media]
    const mat = new THREE.MeshBasicMaterial({ map: t.texture, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })
    const mesh = new THREE.Mesh(unitGeo, mat)
    mesh.scale.set(p.size * t.aspect, p.size, 1)
    mesh.position.set(p.x, p.y, p.z)
    mesh.rotation.z = p.rot
    mesh.userData.op = 0
    scene.add(mesh)
    meshes.push(mesh)
  }
  chunks.set(key, { meshes })
}
function disposeChunk (chunk) {
  for (const m of chunk.meshes) { scene.remove(m); m.material.dispose() }   // geometry + textures are shared
}
function updateChunks () {
  const ccx = Math.floor(camera.position.x / CHUNK)
  const ccy = Math.floor(camera.position.y / CHUNK)
  const ccz = Math.floor(camera.position.z / CHUNK)
  const need = new Set()
  for (let dx = -RENDER_DIST; dx <= RENDER_DIST; dx++)
    for (let dy = -RENDER_DIST; dy <= RENDER_DIST; dy++)
      for (let dz = -RENDER_DIST; dz <= RENDER_DIST; dz++) {
        const key = (ccx + dx) + ',' + (ccy + dy) + ',' + (ccz + dz)
        need.add(key)
        if (!chunks.has(key)) createChunk(ccx + dx, ccy + dy, ccz + dz, key)
      }
  for (const [key, chunk] of chunks) if (!need.has(key)) { disposeChunk(chunk); chunks.delete(key) }
}

// ── Frame ────────────────────────────────────────────────────────────────────
const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v
function tick () {
  // Inertia: velocity chases the accumulated target, which decays (a fling).
  vel.x += (tvel.x - vel.x) * VEL_LERP
  vel.y += (tvel.y - vel.y) * VEL_LERP
  vel.z += (tvel.z - vel.z) * VEL_LERP
  camera.position.x += vel.x
  camera.position.y += vel.y
  camera.position.z += vel.z
  tvel.x *= VEL_DECAY; tvel.y *= VEL_DECAY; tvel.z *= VEL_DECAY

  updateChunks()

  const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z
  for (const [, chunk] of chunks) {
    for (const m of chunk.meshes) {
      const dxy = Math.hypot(m.position.x - cx, m.position.y - cy)
      const dz = Math.abs(m.position.z - cz)
      const hFade = dxy <= HFADE_START ? 1 : clamp01(1 - (dxy - HFADE_START) / (HFADE_END - HFADE_START))
      const zFade = dz <= ZFADE_START ? 1 : clamp01(1 - (dz - ZFADE_START) / (ZFADE_END - ZFADE_START))
      const target = Math.min(hFade, zFade * zFade)
      const op = m.userData.op + (target - m.userData.op) * FADE_LERP
      m.userData.op = op
      m.material.opacity = op
      m.visible = op > INVIS
    }
  }
  renderer.render(scene, camera)
  raf = requestAnimationFrame(tick)
}

// ── Ambient CRT backdrop ─────────────────────────────────────────────────────
function initBackdrop () {
  crt = createCRT({ zIndex: -1, tune: CRT_AMBIENT, mobileTune: CRT_AMBIENT_MOBILE })
  if (!crt) return
  crtSrc = document.createElement('div')
  crtSrc.className = 'lab-crt-src'
  crtSrc.setAttribute('aria-hidden', 'true')
  document.body.appendChild(crtSrc)
  crt.add(crtSrc)
}

// ── Input — drag pan (1 pointer), pinch zoom (2), wheel zoom ──────────────────
function bindInput () {
  onDown = (e) => {
    plane.setPointerCapture?.(e.pointerId)
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    plane.classList.add('is-dragging')
    if (pointers.size === 1) dragLast = { x: e.clientX, y: e.clientY }
    else if (pointers.size === 2) pinchLast = pinchDist()
  }
  onMove = (e) => {
    if (!pointers.has(e.pointerId)) return
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (e.pointerType === 'touch' && e.cancelable) e.preventDefault()
    if (pointers.size >= 2) {
      const d = pinchDist()
      if (pinchLast) tvel.z -= (d - pinchLast) * PINCH_ACCEL   // fingers apart → fly in
      pinchLast = d
      return
    }
    if (dragLast) {
      const dx = e.clientX - dragLast.x, dy = e.clientY - dragLast.y
      tvel.x -= dx * DRAG_ACCEL           // drag right → world right (camera left)
      tvel.y += dy * DRAG_ACCEL           // drag down → world down
      dragLast = { x: e.clientX, y: e.clientY }
    }
  }
  onUp = (e) => {
    pointers.delete(e.pointerId)
    if (pointers.size < 2) pinchLast = 0
    if (pointers.size === 0) { dragLast = null; plane.classList.remove('is-dragging') }
    else { const p = pointers.values().next().value; dragLast = { x: p.x, y: p.y } }
  }
  onWheel = (e) => { e.preventDefault(); tvel.z += e.deltaY * ZOOM_ACCEL }   // scroll down → pull back
  onResize = () => resize()

  plane.addEventListener('pointerdown', onDown)
  plane.addEventListener('pointermove', onMove)
  plane.addEventListener('pointerup', onUp)
  plane.addEventListener('pointercancel', onUp)
  plane.addEventListener('wheel', onWheel, { passive: false })
  window.addEventListener('resize', onResize)
}
function pinchDist () {
  const ps = [...pointers.values()]
  return ps.length >= 2 ? Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) : 0
}
function resize () {
  winW = window.innerWidth; winH = window.innerHeight
  camera.aspect = winW / winH; camera.updateProjectionMatrix()
  renderer.setSize(winW, winH, false)
}

export function init () {
  plane = document.getElementById('tags-plane')
  if (!plane) return
  reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  winW = window.innerWidth; winH = window.innerHeight
  initBackdrop()

  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(62, winW / winH, 0.1, 260)
  camera.position.set(CHUNK / 2, CHUNK / 2, CHUNK / 2)     // start inside a chunk, not on a seam
  const isTouch = window.matchMedia('(pointer: coarse)').matches
  renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.25 : 1.5))
  renderer.setSize(winW, winH, false)
  renderer.setClearColor(0x000000, 0)                     // transparent → CRT shows through
  plane.appendChild(renderer.domElement)
  unitGeo = new THREE.PlaneGeometry(1, 1)

  fetch('/lab/tags.json', { cache: 'no-cache' })
    .then(r => r.ok ? r.json() : [])
    .then(tags => {
      if (!tags.length) { plane.innerHTML = '<p class="tags-empty">No tags yet — drop images in /public/lab/tags</p>'; return }
      const loader = new THREE.TextureLoader()
      textures = tags.map(t => {
        const texture = loader.load(t.src)
        texture.colorSpace = THREE.SRGBColorSpace
        texture.anisotropy = 4
        return { texture, aspect: (t.w && t.h) ? t.w / t.h : 1.4 }
      })
      bindInput()
      raf = requestAnimationFrame(tick)
      revealTags()
      // Debug/tuning + verification handle (matches biakoStickers/biakoWork).
      window.biakoTags = {
        get pos () { return camera ? [+camera.position.x.toFixed(2), +camera.position.y.toFixed(2), +camera.position.z.toFixed(2)] : null },
        get chunks () { return chunks.size },
        get planes () { let n = 0; chunks.forEach(c => n += c.meshes.length); return n },
        get visible () { let n = 0; chunks.forEach(c => c.meshes.forEach(m => { if (m.visible) n++ })); return n },
      }
    })
    .catch(() => {})
}

// Entrance — fade the canvas in once the page has arrived (planes also fade in
// individually as they stream, so this is a gentle overall reveal).
function revealTags () {
  if (revealed || !plane) return
  revealed = true
  requestAnimationFrame(() => plane.classList.add('is-in'))
}
export function entered () { revealTags() }

export function destroy () {
  cancelAnimationFrame(raf); raf = 0
  if (plane) {
    plane.removeEventListener('pointerdown', onDown)
    plane.removeEventListener('pointermove', onMove)
    plane.removeEventListener('pointerup', onUp)
    plane.removeEventListener('pointercancel', onUp)
    plane.removeEventListener('wheel', onWheel)
  }
  window.removeEventListener('resize', onResize)

  // Dispose the GPU graph: chunk materials, the shared geometry, every texture,
  // then the renderer + its context. No creep across repeated visits.
  for (const [, chunk] of chunks) disposeChunk(chunk)
  chunks.clear()
  if (unitGeo) { unitGeo.dispose(); unitGeo = null }
  for (const t of textures) t.texture.dispose()
  textures = []
  if (renderer) {
    renderer.dispose()
    renderer.forceContextLoss?.()
    if (renderer.domElement && renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement)
    renderer = null
  }
  scene = camera = null
  if (crt) { crt.destroy(); crt = null }
  if (crtSrc) { crtSrc.remove(); crtSrc = null }
  if (plane) plane.classList.remove('is-in')
  pointers.clear(); dragLast = null; pinchLast = 0
  vel.x = vel.y = vel.z = 0; tvel.x = tvel.y = tvel.z = 0
  revealed = false; plane = null
  delete window.biakoTags
}
