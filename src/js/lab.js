// Lab page — animated wavy-line "BIAKO" hero.
//
// Technique (a canvas wavy-text field): the word is rendered to an offscreen
// canvas and sampled into an alpha mask; ~60 horizontal lines are drawn across
// the width and each line is displaced upward in proportion to the mask, so the
// letters emerge as a clear relief rising out of the gently rippling lines. The
// cursor pushes the lines apart locally and they spring back (per-point spring).
// Reduced-motion renders the word once, static, with no cursor interaction.
//
// SPA-safe: init()/destroy() tear down the rAF + listeners.

const WORD = 'BIAKO'

let canvas, ctx, off, octx
let raf = 0, t = 0
let W = 0, H = 0, dpr = 1
let lines = 60, stepX = 7, pts = 0, spacing = 0
let mask = [], cur = [], vel = []          // per-line: maskVal / spring pos / vel
let color = '#FFFFE6'
let mouse = { x: -9999, y: -9999, active: false }
let onMove, onLeave, onResize
let reduce = false

const AMP_BASE = 2.2      // px — gentle "alive" ripple on every line
const RADIUS   = 170      // px — cursor influence radius
const PUSH     = 46       // px — how far lines spread from the cursor
const SPRING   = 0.14     // restoring force toward target
const DAMP     = 0.76     // velocity retention → springy settle

function isMobile () { return window.matchMedia('(max-width: 640px)').matches }

function build () {
  dpr = Math.min(window.devicePixelRatio || 1, 2)
  const rect = canvas.getBoundingClientRect()
  W = Math.max(1, Math.round(rect.width))
  H = Math.max(1, Math.round(rect.height))
  canvas.width = W * dpr
  canvas.height = H * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  const mob = isMobile()
  lines = mob ? 34 : 60            // fewer lines on mobile → deeper, clearer relief
  spacing = H / (lines + 1)
  stepX = mob ? 6 : 7
  pts = Math.ceil(W / stepX) + 1

  // ── Render WORD to the offscreen canvas → alpha mask ──
  off.width = W
  off.height = H
  octx.setTransform(1, 0, 0, 1, 0, 0)
  octx.clearRect(0, 0, W, H)
  octx.fillStyle = '#fff'
  octx.textAlign = 'center'
  octx.textBaseline = 'middle'

  // Generous horizontal padding so B and O keep clear air on both sides
  // (a touch tighter on mobile so the wide word doesn't shrink too far).
  const hpad = Math.max(mob ? 28 : 48, W * (mob ? 0.08 : 0.12))
  const maxW = W - 2 * hpad
  let fs = H * 0.74
  const setFont = () => { octx.font = '700 ' + fs + 'px "Archivo Black", system-ui, sans-serif' }
  setFont()
  const measured = octx.measureText(WORD).width
  if (measured > maxW) { fs *= maxW / measured; setFont() }
  octx.filter = 'blur(2px)'          // soft mask edges → smooth amplitude taper
  octx.fillText(WORD, W / 2, H / 2)
  octx.filter = 'none'

  const data = octx.getImageData(0, 0, W, H).data
  mask = []; cur = []; vel = []
  for (let i = 0; i < lines; i++) {
    const y = Math.min(H - 1, Math.round((i + 1) * spacing))
    const row = new Float32Array(pts)
    for (let j = 0; j < pts; j++) {
      const x = Math.min(W - 1, j * stepX)
      row[j] = data[(y * W + x) * 4 + 3] / 255
    }
    mask.push(row)
    cur.push(new Float32Array(pts))
    vel.push(new Float32Array(pts))
  }
}

function draw () {
  if (!reduce) t += 0.02
  ctx.clearRect(0, 0, W, H)
  ctx.strokeStyle = color
  ctx.lineWidth = 1.15
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  const displace = spacing * 3.2    // relief depth of the letters (in line-spacings)

  for (let i = 0; i < lines; i++) {
    const y0 = (i + 1) * spacing
    const row = mask[i], c = cur[i], v = vel[i]
    ctx.beginPath()
    for (let j = 0; j < pts; j++) {
      const x = j * stepX
      const a = row[j]
      // Letters = the lines rise (displacement map); everything ripples gently.
      const lift = -a * displace
      const wave = Math.sin(x * 0.014 - t * 1.1 + i * 0.22) * (AMP_BASE + a * AMP_BASE) + lift

      // Cursor spring — push lines away from the pointer, spring back on leave.
      let target = 0
      if (!reduce && mouse.active) {
        const dx = x - mouse.x, dy = y0 - mouse.y
        const d2 = dx * dx + dy * dy
        if (d2 < RADIUS * RADIUS) {
          const d = Math.sqrt(d2) || 0.001
          const f = 1 - d / RADIUS
          target = (dy >= 0 ? 1 : -1) * f * f * PUSH
        }
      }
      v[j] += (target - c[j]) * SPRING
      v[j] *= DAMP
      c[j] += v[j]

      const y = y0 + wave + c[j]
      if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  if (!reduce) raf = requestAnimationFrame(draw)
}

export function init () {
  canvas = document.getElementById('lab-wave')
  if (!canvas) return
  ctx = canvas.getContext('2d')
  off = document.createElement('canvas')
  octx = off.getContext('2d', { willReadFrequently: true })
  reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const cream = getComputedStyle(document.body).getPropertyValue('--brand-yellow').trim()
  if (cream) color = cream

  const start = () => { build(); draw() }
  start()
  // Re-render once the heavy display face is ready (first pass uses the fallback).
  if (document.fonts && document.fonts.load) {
    document.fonts.load('700 80px "Archivo Black"').then(start).catch(() => {})
  }

  if (!reduce) {
    onMove = (e) => {
      const r = canvas.getBoundingClientRect()
      mouse.x = e.clientX - r.left
      mouse.y = e.clientY - r.top
      mouse.active = mouse.x >= 0 && mouse.x <= r.width && mouse.y >= 0 && mouse.y <= r.height
    }
    onLeave = () => { mouse.active = false }
    canvas.addEventListener('pointermove', onMove, { passive: true })
    canvas.addEventListener('pointerleave', onLeave)
  }
  onResize = () => { build() }
  window.addEventListener('resize', onResize)
}

export function destroy () {
  cancelAnimationFrame(raf); raf = 0
  if (onMove) canvas.removeEventListener('pointermove', onMove)
  if (onLeave) canvas.removeEventListener('pointerleave', onLeave)
  if (onResize) window.removeEventListener('resize', onResize)
  mask = []; cur = []; vel = []
  canvas = ctx = off = octx = null
  mouse = { x: -9999, y: -9999, active: false }
  t = 0
}
