// App entry — loaded once on every page. Boots the persistent shell and the
// barba SPA controller. The shell (nav/footer/grain/theme/clock/scramble) is
// initialised a single time and never re-run; only the barba container (the
// page content + its overlays) swaps between routes. Each page module exposes
// init()/destroy() so its effects mount on enter and fully clean up on leave.

import barba from '@barba/core'
import { initShell } from './shell.js'
import { runTransition } from './transition.js'

// ─── Page registry (lazy — each page + its heavy deps code-split so e.g.
// VFX-JS only loads when you actually visit Stickers) ────────────────────────
const PAGES = {
  home:     () => import('./home.js'),
  work:     () => import('./work.js'),
  stickers: () => import('./stickers.js'),
  about:    () => import('./about.js'),
}   // lab + contact are static — no module
const TITLES = {
  home: 'BIAKO.', work: 'BIAKO. — Work', stickers: 'BIAKO. — Stickers',
  lab: 'BIAKO. — Lab', about: 'BIAKO. — About', contact: 'BIAKO. — Contact',
}

let current = null
async function mount (ns) {
  const load = PAGES[ns]
  if (!load) { current = null; return }
  const mod = await load()
  if (mod.init) mod.init()
  current = mod
}
function unmount () {
  if (current && current.destroy) current.destroy()
  current = null
}

// ─── Boot ─────────────────────────────────────────────────────────────────
initShell()
mount(document.body.dataset.page)   // first (already-rendered) page

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

// Global hooks fire on every route change (not the first load).
barba.hooks.beforeLeave(() => { unmount() })
barba.hooks.beforeEnter(({ next }) => {
  const ns = next.namespace
  document.body.dataset.page = ns
  document.title = TITLES[ns] || 'BIAKO.'
  window.scrollTo(0, 0)
  mount(ns)
})
