// App entry — loaded once on every page. Boots the persistent shell and the
// barba SPA controller. The shell (nav/footer/grain/theme/clock/scramble) is
// initialised a single time and never re-run; only the barba container (the
// page content + its overlays) swaps between routes. Each page module exposes
// init()/destroy() so its effects mount on enter and fully clean up on leave.

import barba from '@barba/core'
import { initShell, getLenis } from './shell.js'
import { runTransition } from './transition.js'

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
mount(document.body.dataset.page, true)   // first (already-rendered) page

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
  getLenis()?.stop()                                   // freeze scroll during the swap
})
barba.hooks.beforeEnter(({ next }) => {
  const ns = next.namespace
  document.body.dataset.page = ns
  document.title = TITLES[ns] || 'BIAKO'
  const l = getLenis()
  if (l) l.scrollTo(0, { immediate: true, force: true })  // force: even while stopped
  else window.scrollTo(0, 0)
  mount(ns)
})
// Fires after the enter transition completes — play the page's entrance now so
// it runs AFTER the transition-in, never during it. Recalc Lenis against the
// new (now laid-out) content and resume; further async growth is picked up by
// Lenis' own ResizeObserver.
barba.hooks.after(() => {
  if (current && current.entered) current.entered()
  const l = getLenis()
  if (l) { l.resize(); l.start() }
})
