// Page transition — VHS "channel-change".
// runTransition('leave'|'enter', container) resolves when its half finishes;
// app.js awaits both (barba runs leave → enter). The old page tears out and is
// buried under a burst of static + rolling scanlines (leave); the swap happens
// hidden behind the static; the new page then rolls in as the signal settles
// (enter).
//
// The glitch lives entirely in a fixed full-screen overlay; the container only
// animates opacity, so fixed children (home-bg, lightbox, drawer) never break.
// Everything is transform/opacity → GPU-friendly. Reduced-motion → instant cut.

import gsap from 'gsap'

// Debug/tuning handle (matches biakoStickers/biakoWork): inspect or slow the
// transition, e.g. biakoFx.gsap.globalTimeline.timeScale(0.2).
window.biakoFx = { gsap }

let overlay, elStatic, elScan, elRoll

function ensureOverlay () {
  if (overlay) return
  overlay = document.createElement('div')
  overlay.className = 'vhs'
  overlay.setAttribute('aria-hidden', 'true')
  overlay.innerHTML =
    '<div class="vhs__static"></div>' +
    '<div class="vhs__scan"></div>' +
    '<div class="vhs__roll"></div>'
  document.body.appendChild(overlay)
  elStatic = overlay.querySelector('.vhs__static')
  elScan   = overlay.querySelector('.vhs__scan')
  elRoll   = overlay.querySelector('.vhs__roll')
}

const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const mobile = () => window.matchMedia('(max-width: 640px)').matches

// GSAP timelines aren't reliably thenable — await via an explicit onComplete.
function play (tl, onDone) {
  return new Promise((res) => tl.eventCallback('onComplete', () => { if (onDone) onDone(); res() }))
}

export function runTransition (phase, container) {
  if (reduce()) {
    if (container) container.style.opacity = phase === 'leave' ? '0' : '1'
    return Promise.resolve()
  }
  ensureOverlay()
  return phase === 'leave' ? leave(container, mobile()) : enter(container, mobile())
}

// ─── LEAVE — old page tears out, buried under static (~320ms) ───────────────
function leave (container, light) {
  document.documentElement.classList.add('is-transitioning')
  const scanPeak   = light ? 0.6 : 0.9
  const staticPeak = light ? 0.7 : 0.94
  const jitter     = light ? 3 : 7

  gsap.set(overlay, { opacity: 1, x: 0 })
  gsap.set([elStatic, elScan, elRoll], { opacity: 0 })

  const tl = gsap.timeline()
  tl.to(elScan, { opacity: scanPeak, duration: 0.05 }, 0)
  tl.fromTo(elRoll, { yPercent: -130, opacity: 0.95 }, { yPercent: 130, duration: 0.24, ease: 'none' }, 0)
  tl.to(overlay, {
    keyframes: [{ x: -jitter, duration: 0.04 }, { x: jitter * 0.8, duration: 0.04 },
                { x: -jitter * 0.5, duration: 0.04 }, { x: jitter * 0.3, duration: 0.04 }, { x: 0, duration: 0.04 }],
    ease: 'steps(1)',
  }, 0.03)
  tl.to(container, { opacity: 0, duration: 0.13, ease: 'power1.in' }, 0.05)
  // Static rises to bury the swap by the end of leave.
  tl.to(elStatic, { opacity: staticPeak, duration: 0.15, ease: 'steps(5)' }, 0.06)
  return play(tl)
}

// ─── ENTER — new page settles in from the static (~340ms) ───────────────────
function enter (container, light) {
  const scanPeak   = light ? 0.6 : 0.9
  const staticStart = light ? 0.7 : 0.94
  const jitter     = light ? 3 : 6

  gsap.set(container, { opacity: 0 })
  gsap.set(overlay, { opacity: 1 })
  gsap.set(elStatic, { opacity: staticStart })
  gsap.set(elScan, { opacity: scanPeak })

  const tl = gsap.timeline()
  // New page appears behind the static, then the static clears to reveal it.
  tl.to(container, { opacity: 1, duration: 0.13, ease: 'power1.out' }, 0)
  tl.fromTo(elRoll, { yPercent: -130, opacity: 0.9 }, { yPercent: 130, duration: 0.26, ease: 'none' }, 0.02)
  tl.to(elStatic, { opacity: 0, duration: 0.18, ease: 'steps(5)' }, 0.06)
  tl.to(elScan, { opacity: 0, duration: 0.2, ease: 'power1.out' }, 0.12)
  tl.to(overlay, {
    keyframes: [{ x: jitter, duration: 0.04 }, { x: -jitter * 0.6, duration: 0.04 },
                { x: jitter * 0.3, duration: 0.04 }, { x: 0, duration: 0.04 }],
    ease: 'steps(1)',
  }, 0.02)

  return play(tl, () => {
    gsap.set(overlay, { opacity: 0, x: 0 })
    gsap.set([elStatic, elScan, elRoll], { opacity: 0 })
    document.documentElement.classList.remove('is-transitioning')
  })
}
