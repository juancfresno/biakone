// Shared pixel-art character — idle cycle (frames 1–4, breathe + blink), an
// arm-raise on hover / cursor proximity (frame 5), and a "¡YEPA! ¡YEPA!" reaction
// on click / tap. Used by the Home and by the About mirror (the idle flip is pure
// CSS: scaleX(-1) on the host). initCharacter(el) mounts on `el` (which must
// contain an <img>) and returns a teardown fn. Reduced-motion: static frame 1,
// still raises on hover and still reacts to click (no idle animation).

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const FRAMES = '/home/character/'
const CLICK_MS = 1000

export function initCharacter (el) {
  const img = el && el.querySelector('img')
  if (!img) return () => {}

  const idle = ['frame-1.svg', 'frame-2.svg', 'frame-3.svg', 'frame-4.svg'].map(f => FRAMES + f)
  const wave = FRAMES + 'frame-5.svg'
  // Click sprites (PNG, larger — bubbles extend beyond the character). The
  // character in each is placed exactly like the idle frames (same size + feet),
  // so at natural size with the same bottom-left anchor the feet don't move. Two
  // facings so the "YEPA!" text always reads correctly:
  //   frame-click-left  — character left / bubbles RIGHT  → not-mirrored hosts (home desktop)
  //   frame-click-right — character right / bubbles LEFT  → mirrored hosts (About, mobile hero)
  const clickLeft = FRAMES + 'frame-click-left.png'
  const clickRight = FRAMES + 'frame-click-right.png'
  ;[...idle, wave, clickLeft, clickRight].forEach(src => { const p = new Image(); p.src = src })   // preload

  let i = 0, raised = false, clicked = false, tick = 0, clickTimer = 0
  img.src = idle[0]
  const show = () => { if (clicked) return; img.src = raised ? wave : idle[i] }   // click sprite wins for its 1s
  const raise = () => { if (!raised) { raised = true; show() } }
  const lower = () => { if (raised) { raised = false; show() } }

  // Is the host horizontally mirrored right now (About always; the home hero on
  // mobile)? Read the live computed transform so it follows the breakpoint.
  const mirrored = () => {
    const t = window.getComputedStyle(el).transform
    return t && t.startsWith('matrix') && parseFloat(t.slice(7)) < 0
  }
  // Click / tap → swap to the matching YEPA sprite for ~1s, then back. Restarts
  // cleanly on rapid repeat (no stacking / flicker).
  const yepa = () => {
    clearTimeout(clickTimer)
    clicked = true
    const flip = mirrored()
    img.src = flip ? clickRight : clickLeft
    el.classList.add('is-click')
    el.classList.toggle('is-click--flip', flip)   // CSS counter-mirrors so the text reads correctly
    clickTimer = setTimeout(() => {
      clicked = false; clickTimer = 0
      el.classList.remove('is-click', 'is-click--flip')
      show()                                       // back to idle (or wave if still hovered)
    }, CLICK_MS)
  }
  el.addEventListener('click', yepa)               // fires on desktop click AND mobile tap

  if (!reduceMotion()) tick = setInterval(() => { if (!raised && !clicked) { i = (i + 1) % idle.length; show() } }, 380)
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
    clearTimeout(clickTimer)
    el.removeEventListener('click', yepa)
    el.removeEventListener('pointerenter', raise)
    el.removeEventListener('pointerleave', lower)
    if (onMove) window.removeEventListener('mousemove', onMove)
    el.classList.remove('is-click', 'is-click--flip')
  }
}
