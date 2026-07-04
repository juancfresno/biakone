// Tag marquee + 3D lightbox — shared component (Home + About).
// initTags() renders the marquee from /tags.json and wires the floating 3D
// lightbox; destroyTags() tears down the listeners it put on document/body so
// nothing leaks across barba transitions. Elements (#tags-track, #lightbox*)
// live inside the swapped container, so per-element listeners GC with the DOM —
// we only need to clean up the document/body ones ourselves.

let cleanup = []

function itemHtml (item, i) {
  return (
    '<button class="tags__item" type="button" data-src="' + item.src + '" ' +
      'aria-label="Open tag ' + (i + 1) + '">' +
      '<img src="' + item.src + '" alt="" loading="lazy" decoding="async">' +
    '</button>'
  )
}

export function initTags () {
  const track = document.getElementById('tags-track')
  if (!track) return

  // ─── Marquee ───────────────────────────────────────────────
  function render (items) {
    if (!items.length) {
      track.innerHTML = '<div class="tags__empty">No tags yet — drop images in /public/tags</div>'
      track.style.animation = 'none'
      return
    }
    const half = items.map(itemHtml).join('')
    track.innerHTML = half + half
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
  const lb    = document.getElementById('lightbox')
  const img   = document.getElementById('lightbox-img')
  const frame = document.getElementById('lightbox-frame')
  if (!lb || !img || !frame) return

  const reduce  = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const MAX_DEG = 22
  const MAX_TX  = 26

  function recenter () {
    frame.style.setProperty('--lb-rx', '0deg')
    frame.style.setProperty('--lb-ry', '0deg')
    frame.style.setProperty('--lb-tx', '0px')
    frame.style.setProperty('--lb-ty', '0px')
  }
  function open (src) {
    img.src = src
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
      frame.style.setProperty('--lb-ry', (nx * MAX_DEG).toFixed(2) + 'deg')
      frame.style.setProperty('--lb-rx', (-ny * MAX_DEG).toFixed(2) + 'deg')
      frame.style.setProperty('--lb-tx', (nx * MAX_TX).toFixed(1) + 'px')
      frame.style.setProperty('--lb-ty', (ny * MAX_TX).toFixed(1) + 'px')
    })
    lb.addEventListener('mouseleave', recenter)
  }

  // Ensure a page leaving mid-lightbox doesn't strip the next page's scroll lock.
  cleanup.push(() => { document.body.classList.remove('lb-open'); document.body.style.overflow = '' })
}

export function destroyTags () {
  cleanup.forEach(fn => fn())
  cleanup = []
}
