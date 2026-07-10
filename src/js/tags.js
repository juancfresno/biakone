// Tag marquee + 3D lightbox — shared component (Home + About). Driven from the
// SHELL lifecycle (app.js), NOT page-level init: initTags(root) renders the
// marquee inside `root` (the current barba container) and wires the floating 3D
// lightbox; destroyTags() tears down the document/body listeners it added.
//
// Scoping to `root` is essential: during a barba transition BOTH the leaving and
// entering containers are in the DOM at once, so a document-wide
// getElementById('tags-track') would grab the OLD (dying) container's track and
// render into it, leaving the new page's marquee empty. Querying within the
// entering container fixes that. initTags is idempotent (it tears down first).

let cleanup = []

function itemHtml (item, i) {
  return (
    '<button class="tags__item" type="button" data-src="' + item.src + '" ' +
      'aria-label="Open tag ' + (i + 1) + '">' +
      '<img src="' + item.src + '" alt="" loading="lazy" decoding="async">' +
    '</button>'
  )
}

export function initTags (root) {
  destroyTags()                                   // idempotent — never double-bind
  root = root || document
  const track = root.querySelector('.tags__track')
  if (!track) return                              // page has no marquee → nothing to do

  // ─── Marquee ───────────────────────────────────────────────
  function render (items) {
    if (!items || !items.length) {
      track.innerHTML = '<div class="tags__empty">No tags yet — drop images in /public/tags</div>'
      track.style.animation = 'none'
      return
    }
    const half = items.map(itemHtml).join('')
    track.innerHTML = half + half
    track.style.animation = ''                    // restore the CSS marquee (in case a prior empty render killed it)
    const nodes = track.querySelectorAll('.tags__item')
    for (let i = items.length; i < nodes.length; i++) {
      nodes[i].setAttribute('aria-hidden', 'true')
      nodes[i].setAttribute('tabindex', '-1')
    }
  }
  fetch('/tags.json', { cache: 'no-cache' })
    .then(r => r.ok ? r.json() : [])
    .then(render)
    .catch(() => render([]))

  // ─── Lightbox ──────────────────────────────────────────────
  const lb    = root.querySelector('.lightbox')
  const img   = lb && lb.querySelector('.lightbox__img')
  const frame = lb && lb.querySelector('.lightbox__frame')
  if (!lb || !img || !frame) return

  const reduce  = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const MAX_DEG = 28    // stronger tilt
  const MAX_TX  = 44    // more parallax drift
  const MAX_TZ  = 55    // depth — pops toward the viewer near centre

  function recenter () {
    frame.style.setProperty('--lb-rx', '0deg')
    frame.style.setProperty('--lb-ry', '0deg')
    frame.style.setProperty('--lb-tx', '0px')
    frame.style.setProperty('--lb-ty', '0px')
    frame.style.setProperty('--lb-tz', '0px')
    frame.style.setProperty('--lb-s', '1')
  }
  function open (src) {
    img.src = src
    // Re-parent to <body> so the page-blur (body.lb-open > *:not(.lightbox))
    // actually excludes it — otherwise it blurs with the container it lived in.
    if (lb.parentElement !== document.body) document.body.appendChild(lb)
    lb.hidden = false
    document.body.classList.add('lb-open')
    document.body.style.overflow = 'hidden'
    recenter()
  }
  function close () {
    lb.hidden = true
    img.src = ''
    document.body.classList.remove('lb-open')
    document.body.style.overflow = ''
    recenter()
  }

  track.addEventListener('click', (e) => {
    const item = e.target.closest('.tags__item')
    if (!item) return
    const src = item.getAttribute('data-src')
    if (src) open(src)
  })
  lb.addEventListener('click', (e) => {
    if (e.target.closest('[data-lightbox-close]')) close()
  })

  const onKey = (e) => { if (e.key === 'Escape' && !lb.hidden) close() }
  document.addEventListener('keydown', onKey)
  cleanup.push(() => document.removeEventListener('keydown', onKey))

  if (!reduce) {
    lb.addEventListener('mousemove', (e) => {
      const nx = (e.clientX / window.innerWidth  - 0.5) * 2
      const ny = (e.clientY / window.innerHeight - 0.5) * 2
      const dist = Math.min(1, Math.hypot(nx, ny))    // 0 centre → 1 corners
      frame.style.setProperty('--lb-ry', (nx * MAX_DEG).toFixed(2) + 'deg')
      frame.style.setProperty('--lb-rx', (-ny * MAX_DEG).toFixed(2) + 'deg')
      frame.style.setProperty('--lb-tx', (nx * MAX_TX).toFixed(1) + 'px')
      frame.style.setProperty('--lb-ty', (ny * MAX_TX).toFixed(1) + 'px')
      frame.style.setProperty('--lb-tz', ((1 - dist) * MAX_TZ).toFixed(1) + 'px')
      frame.style.setProperty('--lb-s', (1.02 + (1 - dist) * 0.05).toFixed(3))
    })
    lb.addEventListener('mouseleave', recenter)
  }

  // Ensure a page leaving mid-lightbox doesn't strip the next page's scroll lock,
  // and remove the re-parented lightbox so it doesn't outlive its page.
  cleanup.push(() => {
    document.body.classList.remove('lb-open')
    document.body.style.overflow = ''
    if (lb.parentElement === document.body) lb.remove()
  })
}

export function destroyTags () {
  cleanup.forEach(fn => fn())
  cleanup = []
}
