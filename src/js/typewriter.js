// Shared terminal-style typewriter — types the text of a container's <p> children
// in sequence, left→right, with a blinking caret. Used by the home-v2 intro and
// the About body so both share ONE entrance effect.
//
// typewrite(container, opts?) → cancel function. Under prefers-reduced-motion it
// leaves the full text untouched (instant) and returns a no-op. The caret class
// is caller-supplied so each page keeps its own caret styling.

export function typewrite (container, opts = {}) {
  const noop = () => {}
  if (!container) return noop
  const { caretClass = 'tw-caret', cps = 260 } = opts
  const ps = [...container.querySelectorAll('p')]
  if (!ps.length) return noop
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return noop

  const texts = ps.map(p => p.textContent)
  const total = texts.reduce((a, t) => a + t.length, 0)
  if (!total) return noop

  container.style.minHeight = container.offsetHeight + 'px'   // reserve height → no reflow jump
  ps.forEach(p => { p.textContent = '' })

  const caret = document.createElement('span')
  caret.className = caretClass
  caret.setAttribute('aria-hidden', 'true')
  caret.textContent = '▍'

  let raf = 0
  const t0 = performance.now()
  const step = (now) => {
    const show = Math.floor((now - t0) / 1000 * cps)
    let rem = show, placed = false
    for (let i = 0; i < ps.length; i++) {
      const t = texts[i]
      const n = Math.max(0, Math.min(t.length, rem))
      ps[i].textContent = t.slice(0, n)
      if (!placed && n < t.length) { ps[i].appendChild(caret); placed = true }
      rem -= t.length
    }
    if (!placed) ps[ps.length - 1].appendChild(caret)
    if (show < total) raf = requestAnimationFrame(step)
    else { caret.remove(); container.style.minHeight = '' }
  }
  raf = requestAnimationFrame(step)

  return () => { cancelAnimationFrame(raf); caret.remove(); container.style.minHeight = '' }
}
