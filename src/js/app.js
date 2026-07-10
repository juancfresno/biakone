// App entry — loaded once on every page. Boots the persistent shell and the
// barba SPA controller. The shell (nav/footer/grain/clock/scramble) is
// initialised a single time and never re-run; only the barba container (the
// page content + its overlays) swaps between routes. Each page module exposes
// init()/destroy() so its effects mount on enter and fully clean up on leave.

import barba from '@barba/core'
import { initShell, getLenis } from './shell.js'
import { runTransition } from './transition.js'
import { initTags, destroyTags } from './tags.js'

// ─── Page registry (lazy — each page + its heavy deps code-split so e.g.
// VFX-JS only loads when you actually visit Stickers) ────────────────────────
const PAGES = {
  home:     () => import('./home.js'),
  work:     () => import('./work.js'),
  stickers: () => import('./stickers.js'),
  posters:  () => import('./posters.js'),
  lab:      () => import('./lab.js'),
  'vandal-rush': () => import('./vandal-rush.js'),
  about:    () => import('./about.js'),
}   // contact is static — no module
const TITLES = {
  home: 'Biakone — Urban Objects, Graffiti & Scale Work', work: 'Work — Biakone', stickers: 'Stickers — Biakone',
  posters: 'Posters — Biakone', lab: 'Lab — Biakone', 'vandal-rush': 'Vandal Rush — Lab — Biakone', about: 'About — Biakone', contact: 'Contact — Biakone',
}

// ─── Per-page shell theming ──────────────────────────────────────────────────
// The fixed nav/footer sit OVER each page's surface; on always-dark pages the
// `data-shell` can't reach them via CSS alone. Mirror it onto <html> — where the
// [data-shell] token pins live — on first load AND every barba enter (so direct
// URLs and route changes both recolor the shell; "auto"/absent ⇒ the ink just
// follows the theme). Independent of [data-theme], so the ◐ toggle keeps working.
function applyShell (container) {
  document.documentElement.dataset.shell = (container && container.dataset.shell) || 'auto'
}

// ─── Tag marquee — lives in the SHELL lifecycle (never page-level init) ───────
// Init scoped to the current barba container. During a transition BOTH containers
// coexist, so a document-wide lookup would render into the dying one and leave the
// new marquee empty; initTags(container) targets the right track. Idempotent.
function ensureMarquee (container) {
  if (!container) return
  // Safety net: if, a beat after the transition, the marquee is still empty (and
  // it's not the deliberate "no tags" state), re-init once.
  setTimeout(() => {
    const track = container.querySelector('.tags__track')
    if (track && !track.querySelector('.tags__item') && !track.querySelector('.tags__empty')) {
      initTags(container)
    }
  }, 900)
}

let current = null
async function mount (ns, andEnter) {
  const load = PAGES[ns]
  if (!load) { current = null; return }
  const mod = await load()
  if (mod.init) mod.init()
  current = mod
  // On the first (non-transitioned) load there's no barba `after` hook, so let
  // the page play its entrance immediately.
  if (andEnter && mod.entered) mod.entered()
}
function unmount () {
  if (current && current.destroy) current.destroy()
  current = null
}

// ─── Boot ─────────────────────────────────────────────────────────────────
initShell()
const firstContainer = document.querySelector('[data-barba="container"]')
applyShell(firstContainer)     // first load / direct URL
mount(document.body.dataset.page, true)   // first (already-rendered) page
initTags(firstContainer)       // marquee — from the shell, scoped to the container
ensureMarquee(firstContainer)

barba.init({
  debug: false,
  timeout: 8000,
  transitions: [{
    name: 'vhs',
    // Old page out, then new page in — the visual glitch is handled by
    // runTransition (transition.js); barba just awaits the two halves.
    async leave ({ current }) { await runTransition('leave', current.container) },
    async enter ({ next })    { await runTransition('enter', next.container) },
  }],
})

// Global hooks fire on every route change (not the first load). Lenis is a
// single persistent instance — we never destroy/re-create it (no double
// instances); instead we pause it for the transition, jump scroll to the top,
// then recalc against the new content and resume once it has mounted.
barba.hooks.beforeLeave(() => {
  unmount()
  destroyTags()                                        // clean the leaving marquee/lightbox listeners
  getLenis()?.stop()                                   // freeze scroll during the swap
})
barba.hooks.beforeEnter(({ next }) => {
  const ns = next.namespace
  document.body.dataset.page = ns
  document.title = TITLES[ns] || 'BIAKO'
  applyShell(next.container)                  // recolor the shell as the new page enters
  const l = getLenis()
  if (l) l.scrollTo(0, { immediate: true, force: true })  // force: even while stopped
  else window.scrollTo(0, 0)
  mount(ns)
  initTags(next.container)                    // marquee — scoped to the ENTERING container
})
// Fires after the enter transition completes — play the page's entrance now so
// it runs AFTER the transition-in, never during it. Recalc Lenis against the
// new (now laid-out) content and resume; further async growth is picked up by
// Lenis' own ResizeObserver.
barba.hooks.after(({ next }) => {
  if (current && current.entered) current.entered()
  const l = getLenis()
  if (l) { l.resize(); l.start() }
  ensureMarquee(next.container)               // marquee self-check
})
