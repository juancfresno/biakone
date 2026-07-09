// Shared ElasticLine — a spring-driven SVG line that bulges toward the cursor and
// bounces back. This is the exact effect the Work list uses for its row dividers
// (work.js initElasticLines, itself a port of the portfolio's
// ui/ElasticLine/ElasticLine.tsx) — extracted here so other pages reuse the same
// physics rather than re-implementing it.
//
// initElasticLines(hosts, opts) appends one line SVG into each host element and
// runs the shared spring loop. Desktop / fine-pointer only; it returns a no-op
// teardown under reduced-motion or on coarse pointers so callers keep whatever
// static CSS border they use as the fallback. The returned function tears down
// the rAF loop, listeners and injected SVGs.

const NS = 'http://www.w3.org/2000/svg'

export function initElasticLines (hosts, opts = {}) {
  hosts = [...hosts]
  const noop = () => {}
  if (!hosts.length) return noop
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return noop
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return noop

  const {
    className = 'elastic-line', activeClass = null,
    SPRING_K = 0.06, DAMPING = 0.93, PROXIMITY = 55, MAX_DISP = 26,
  } = opts

  const lines = []
  for (const host of hosts) {
    const svg = document.createElementNS(NS, 'svg')
    svg.setAttribute('class', className)
    svg.setAttribute('aria-hidden', 'true')
    const path = document.createElementNS(NS, 'path')
    path.setAttribute('stroke', 'currentColor')
    path.setAttribute('stroke-width', '1')
    path.setAttribute('fill', 'none')
    path.setAttribute('d', 'M 0 0.5 L 1 0.5')
    svg.appendChild(path)
    host.appendChild(svg)
    if (activeClass) host.classList.add(activeClass)
    lines.push({ svg, path, y: 0, vy: 0, cpx: 0, target: 0, w: 0, wasNear: false, straight: true })
  }

  const measure = () => {
    for (const L of lines) { L.w = L.svg.getBoundingClientRect().width; L.path.setAttribute('d', 'M 0 0.5 L ' + L.w + ' 0.5') }
  }
  measure()

  let lastMouseY = 0, lastTime = 0, mouseVY = 0
  const onMove = (e) => {
    const now = Date.now()
    const dt = now - lastTime
    if (dt > 0 && dt < 80) mouseVY = (e.clientY - lastMouseY) / dt
    lastMouseY = e.clientY; lastTime = now
    for (const L of lines) {
      const rect = L.svg.getBoundingClientRect()
      const distY = e.clientY - (rect.top + 0.5)
      const inX = e.clientX >= rect.left && e.clientX <= rect.right
      const near = inX && Math.abs(distY) < PROXIMITY
      if (near) {
        L.cpx = e.clientX - rect.left
        L.target = Math.max(-MAX_DISP, Math.min(MAX_DISP, distY * 0.8))
      } else {
        if (L.wasNear) L.vy += mouseVY * 0.35
        L.target = 0
      }
      L.wasNear = near
    }
  }
  window.addEventListener('mousemove', onMove, { passive: true })
  window.addEventListener('resize', measure)

  let rafId = requestAnimationFrame(function tick () {
    for (const L of lines) {
      L.vy += (L.target - L.y) * SPRING_K
      L.vy *= DAMPING
      L.y += L.vy
      const flat = Math.abs(L.y) < 0.08 && Math.abs(L.vy) < 0.05
      if (!flat) {
        L.straight = false
        L.path.setAttribute('d', 'M 0 0.5 Q ' + L.cpx + ' ' + (0.5 + L.y) + ' ' + L.w + ' 0.5')
      } else if (!L.straight) {
        L.straight = true; L.y = 0; L.vy = 0
        L.path.setAttribute('d', 'M 0 0.5 L ' + L.w + ' 0.5')
      }
    }
    rafId = requestAnimationFrame(tick)
  })

  return () => {
    cancelAnimationFrame(rafId)
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('resize', measure)
    for (const L of lines) L.svg.remove()
    if (activeClass) for (const host of hosts) host.classList.remove(activeClass)
  }
}
