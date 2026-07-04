// Page transition — PHASE 1: a quick, rock-solid fade to prove the barba
// mechanism. runTransition('leave'|'enter', container) resolves when its half
// of the animation finishes; app.js awaits it. Reduced-motion → instant cut.
// (Phase 2 swaps this for the VHS channel-change effect.)

import gsap from 'gsap'

const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function runTransition (phase, container) {
  if (reduce()) {
    if (container) container.style.opacity = phase === 'leave' ? '0' : '1'
    return Promise.resolve()
  }
  if (phase === 'leave') {
    return gsap.to(container, { opacity: 0, duration: 0.22, ease: 'power1.in' })
  }
  return gsap.fromTo(container, { opacity: 0 }, { opacity: 1, duration: 0.28, ease: 'power1.out' })
}
