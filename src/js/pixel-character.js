// Shared pixel-art character — idle cycle (frames 1–4, breathe + blink) and an
// arm-raise on hover / cursor proximity (frame 5). Used by the Home and by the
// About mirror (the flip is pure CSS: scaleX(-1) on the host, no flipped frames
// needed). initCharacter(el) mounts on `el` (which must contain an <img>) and
// returns a teardown fn. Reduced-motion: static frame 1, still raises on hover.

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const FRAMES = '/home/character/'

export function initCharacter (el) {
  const img = el && el.querySelector('img')
  if (!img) return () => {}

  const idle = ['frame-1.svg', 'frame-2.svg', 'frame-3.svg', 'frame-4.svg'].map(f => FRAMES + f)
  const wave = FRAMES + 'frame-5.svg'
  ;[...idle, wave].forEach(src => { const p = new Image(); p.src = src })   // preload

  let i = 0, raised = false, tick = 0
  img.src = idle[0]
  const show = () => { img.src = raised ? wave : idle[i] }
  const raise = () => { if (!raised) { raised = true; show() } }
  const lower = () => { if (raised) { raised = false; show() } }

  if (!reduceMotion()) tick = setInterval(() => { if (!raised) { i = (i + 1) % idle.length; show() } }, 380)
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

  return () => {
    if (tick) clearInterval(tick)
    el.removeEventListener('pointerenter', raise)
    el.removeEventListener('pointerleave', lower)
    if (onMove) window.removeEventListener('mousemove', onMove)
  }
}
