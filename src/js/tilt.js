// Cursor-driven 3D tilt / parallax — the home-footer tag lightbox effect, shared.
//
// attachTilt(hitEl, frameEl, opts) wires pointer movement over hitEl into the
// --lb-* custom properties on frameEl, which a `perspective` transform consumes
// (translate3d + rotateX/Y + scale). The image pops toward the viewer near centre
// and drifts/rotates toward the pointer at the edges. Returns a detach() fn.
//
// Reduced-motion or coarse-pointer (touch) → no tilt, frame stays centred.

const DEFAULTS = { maxDeg: 28, maxTx: 44, maxTz: 55, scale: 0.05 }

export function attachTilt (hitEl, frameEl, opts = {}) {
  const { maxDeg, maxTx, maxTz, scale } = { ...DEFAULTS, ...opts }

  const recenter = () => {
    frameEl.style.setProperty('--lb-rx', '0deg')
    frameEl.style.setProperty('--lb-ry', '0deg')
    frameEl.style.setProperty('--lb-tx', '0px')
    frameEl.style.setProperty('--lb-ty', '0px')
    frameEl.style.setProperty('--lb-tz', '0px')
    frameEl.style.setProperty('--lb-s', '1')
  }
  recenter()

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduce) return recenter                     // detach() = harmless recenter

  const onMove = (e) => {
    if (e.pointerType === 'touch') return          // no tilt on touch (task: mobile off)
    const nx = (e.clientX / window.innerWidth  - 0.5) * 2
    const ny = (e.clientY / window.innerHeight - 0.5) * 2
    const dist = Math.min(1, Math.hypot(nx, ny))   // 0 centre → 1 corners
    frameEl.style.setProperty('--lb-ry', (nx * maxDeg).toFixed(2) + 'deg')
    frameEl.style.setProperty('--lb-rx', (-ny * maxDeg).toFixed(2) + 'deg')
    frameEl.style.setProperty('--lb-tx', (nx * maxTx).toFixed(1) + 'px')
    frameEl.style.setProperty('--lb-ty', (ny * maxTx).toFixed(1) + 'px')
    frameEl.style.setProperty('--lb-tz', ((1 - dist) * maxTz).toFixed(1) + 'px')
    frameEl.style.setProperty('--lb-s', (1.02 + (1 - dist) * scale).toFixed(3))
  }
  hitEl.addEventListener('pointermove', onMove)
  hitEl.addEventListener('pointerleave', recenter)
  return () => {
    hitEl.removeEventListener('pointermove', onMove)
    hitEl.removeEventListener('pointerleave', recenter)
    recenter()
  }
}
