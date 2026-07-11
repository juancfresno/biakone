// Shared ElasticLine — a spring-driven SVG line that bulges toward the cursor and
// bounces back. Exact port of the portfolio's ui/ElasticLine/ElasticLine.tsx
// physics (SPRING_K 0.06 / DAMPING 0.93 / PROXIMITY 55 / MAX_DISP 26, mouse-
// velocity impulse ×0.35, target distY×0.8, flat thresholds |y|<0.08 |vy|<0.05).
// The Work list uses these same values for its row dividers.
//
// initElasticLines(hosts, opts) appends one line SVG into each host and runs the
// shared spring loop. Desktop / fine-pointer only; a no-op teardown under reduced-
// motion or coarse pointers keeps whatever static CSS border the caller uses.
//
// FLICKER FIX (opts.revealSelector): when a host sits inside a glitch-reveal
// element (HOME's .hv2-reveal), the reveal's filter/clip-path/transform group the
// whole subtree for ~0.56s — the SVG can't escape it and flickers. So we keep the
// line DORMANT (host without activeClass → static CSS border shows, SVG hidden via
// CSS) until that ancestor's `about-glitch-in` animation ends, then activate. No
// revealSelector → immediate activation (Work / About are unchanged).

const NS = 'http://www.w3.org/2000/svg'

export function initElasticLines (hosts, opts = {}) {
  hosts = [...hosts]
  const noop = () => {}
  if (!hosts.length) return noop
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return noop
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return noop

  const {
    className = 'elastic-line', activeClass = null, revealSelector = null,
    SPRING_K = 0.06, DAMPING = 0.93, PROXIMITY = 55, MAX_DISP = 26,
  } = opts

  const lines = []
  const cleanups = []

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

    const L = { host, svg, path, y: 0, vy: 0, cpx: 0, target: 0, w: 0, wasNear: false, straight: true, active: false }
    lines.push(L)

    const activate = () => {
      if (L.active) return
      L.active = true
      // Fresh measure now that the section has settled (post-reveal layout).
      L.w = L.svg.getBoundingClientRect().width
      L.path.setAttribute('d', 'M 0 0.5 L ' + L.w + ' 0.5')
      if (activeClass) host.classList.add(activeClass)
    }

    const revealEl = revealSelector ? host.closest(revealSelector) : null
    if (!revealEl) {
      activate()                                            // no reveal → live at once (Work / About)
    } else if (revealEl.classList.contains('is-in')) {
      const t = setTimeout(activate, 700)                   // already revealing → after the glitch settles
      cleanups.push(() => clearTimeout(t))
    } else {
      // Take over only once the section's glitch-reveal has finished playing.
      const onEnd = (e) => {
        if (e.target === revealEl && e.animationName === 'about-glitch-in') {
          revealEl.removeEventListener('animationend', onEnd)
          activate()
        }
      }
      revealEl.addEventListener('animationend', onEnd)
      const t = setTimeout(() => { if (revealEl.classList.contains('is-in')) activate() }, 4000)  // safety net
      cleanups.push(() => { revealEl.removeEventListener('animationend', onEnd); clearTimeout(t) })
    }
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
      if (!L.active) continue
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
      if (!L.active) continue
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
    for (const fn of cleanups) fn()
    for (const L of lines) { L.svg.remove(); if (activeClass) L.host.classList.remove(activeClass) }
  }
}
