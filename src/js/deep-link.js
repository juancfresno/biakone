// Deep-link scroll — shared by /posters and /stickers. The home Posters/Stickers
// modules link to `/<page>#<prefix>-<n>` where n is the index of the item they're
// currently showing (same manifest → same order as the destination cells). Once
// the page has entered AND its cells are laid out, this centres the n-th cell in
// the viewport with an INSTANT jump (via the shared Lenis instance), so the user
// lands directly on that piece. No matching hash → no-op (page stays at the top).
import { getLenis } from './shell.js'

// barba.js strips the URL hash on SPA navigation, so a clicked home module also
// records its intent here (e.g. 'p-3'); the destination consumes whichever it
// finds. The URL hash still works for new-tab / direct entry.
let pending = null
export function setPendingDeepLink (target) { pending = target }

// Display order for the Stickers/Posters manifests = NEWEST FIRST. The manifests
// are built in ascending filename-numeric order (oldest → newest), so newest-first
// is just the reverse. Applied at every consumer (both pages AND both home modules)
// so their indices stay in lock-step — the deep-link n from a home module lands on
// the same item on the destination page. Not by renaming: a new drop = next number
// = automatically first. Returns a new array (never mutates the manifest).
export function newestFirst (items) { return Array.isArray(items) ? items.slice().reverse() : [] }

export function scrollToDeepLink (prefix, cellSelector) {
  const re = new RegExp('^' + prefix + '-(\\d+)$')
  const hash = (location.hash || '').replace(/^#/, '')
  const source = re.test(hash) ? hash : pending     // URL hash (direct) OR click intent (barba SPA)
  pending = null
  const m = source && source.match(re)
  if (!m) return
  const n = parseInt(m[1], 10)
  const cells = document.querySelectorAll(cellSelector)
  const target = cells[n]
  if (!target) return

  // Reflect the deep-link in the URL (barba strips the hash on SPA nav) so it's
  // shareable and survives a reload.
  try { history.replaceState(history.state, '', location.pathname + location.search + '#' + prefix + '-' + n) } catch (e) {}

  const centre = () => {
    const el = target.querySelector('img') || target
    const lenis = getLenis()
    if (lenis) lenis.resize()                     // scroll limit = the full (now-tall) page
    const rect = el.getBoundingClientRect()
    const scrollY = window.scrollY || window.pageYOffset || 0
    const y = Math.max(0, scrollY + rect.top - (window.innerHeight - rect.height) / 2)
    if (lenis) lenis.scrollTo(y, { immediate: true, force: true })
    else window.scrollTo(0, y)
  }
  // The cell + image sizes are known from the <img width/height> attributes
  // (aspect-ratio) before the pixels load, so a couple of frames to let the
  // layout settle is enough — no need to await image decode.
  requestAnimationFrame(() => requestAnimationFrame(centre))
}
