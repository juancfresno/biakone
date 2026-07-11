// Shared photo hover glitch — a subdued, looping version of the takeover entrance
// glitch (cyan/red RGB clip-path slice bands). Used by the Work mosaic cells and
// the Home hero image.
//
// bindPhotoGlitch(host) binds pointerenter/leave on `host` (the element that
// contains the <img>). On enter it appends two transient clone layers (cyan + red)
// over the image and lets photo-glitch.css run the burst loop; on leave they fade
// out (~150ms) and are removed — no permanent extra DOM. Layers are reused during
// rapid in/out so quick sweeps across many cells never churn or leak.
//
// Guards: desktop / fine-pointer only, and nothing under reduced motion.
// Returns { destroy, refresh } — refresh() rebuilds the layers with the current
// image (call it when a slider swaps the host's photo, so the hover doesn't show a
// stale frame or fight the swap's own transition).

const fine   = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches
const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const noop = () => {}

export function bindPhotoGlitch (host) {
  if (!host || !fine()) return { destroy: noop, refresh: noop }

  let layers = []
  let hovered = false
  let removeTimer = 0, rebuildTimer = 0

  const build = () => {
    if (layers.length) return
    const img = host.querySelector('img')
    const src = img && (img.currentSrc || img.src)
    if (!src || reduce()) return
    layers = ['c', 'r'].map((mod) => {
      const layer = document.createElement('div')
      layer.className = 'photo-glitch__layer photo-glitch__layer--' + mod
      layer.setAttribute('aria-hidden', 'true')
      const clone = document.createElement('img')
      clone.src = src
      clone.alt = ''
      clone.decoding = 'async'
      layer.appendChild(clone)
      host.appendChild(layer)
      return layer
    })
    void host.offsetWidth                 // commit before fading in (opacity transition)
    layers.forEach((l) => l.classList.add('is-in'))
  }
  const removeNow = () => { layers.forEach((l) => l.remove()); layers = [] }

  const onEnter = () => {
    hovered = true
    if (reduce()) return
    clearTimeout(removeTimer); removeTimer = 0
    if (layers.length) { layers.forEach((l) => l.classList.add('is-in')); return }   // reuse mid-fade
    build()
  }
  const onLeave = () => {
    hovered = false
    clearTimeout(rebuildTimer)
    layers.forEach((l) => l.classList.remove('is-in'))          // fade out…
    clearTimeout(removeTimer)
    removeTimer = setTimeout(removeNow, 220)                    // …then drop the DOM
  }
  host.addEventListener('pointerenter', onEnter)
  host.addEventListener('pointerleave', onLeave)

  // Rebuild with the current image (a slider swapped the host's photo). Drop the
  // stale layers at once and, if still hovered, rebuild after the swap's own glitch.
  const refresh = () => {
    if (!hovered) return
    removeNow()
    clearTimeout(rebuildTimer)
    rebuildTimer = setTimeout(() => { if (hovered && !reduce()) build() }, 650)
  }
  const destroy = () => {
    host.removeEventListener('pointerenter', onEnter)
    host.removeEventListener('pointerleave', onLeave)
    clearTimeout(removeTimer); clearTimeout(rebuildTimer)
    removeNow()
    hovered = false
  }
  return { destroy, refresh }
}
