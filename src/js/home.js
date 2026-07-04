// Home — fetch /tags.json, render a duplicated tag row for a seamless marquee,
// and reuse the shared 3D lightbox when a tag is clicked.

// ─── Tag marquee ───────────────────────────────────────────────
;(function () {
  const track = document.getElementById('tags-track')
  if (!track) return

  function itemHtml (item, i) {
    return (
      '<button class="tags__item" type="button" data-src="' + item.src + '" ' +
        'aria-label="Open tag ' + (i + 1) + '">' +
        '<img src="' + item.src + '" alt="" loading="lazy" decoding="async">' +
      '</button>'
    )
  }

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
})()

// ─── Lightbox — open on tag click, perspective tilt, Esc/outside close.
;(function () {
  const lb    = document.getElementById('lightbox')
  const img   = document.getElementById('lightbox-img')
  const frame = document.getElementById('lightbox-frame')
  const track = document.getElementById('tags-track')
  if (!lb || !img || !frame || !track) return

  const reduce   = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const MAX_DEG  = 22      // exaggerated tilt
  const MAX_TX   = 26      // px of parallax drift toward the cursor

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

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !lb.hidden) close()
  })

  if (!reduce) {
    // Track the cursor across the WHOLE overlay/viewport: the tag tilts and
    // drifts toward wherever the cursor is, not just when over the image.
    lb.addEventListener('mousemove', (e) => {
      const nx = (e.clientX / window.innerWidth  - 0.5) * 2   // -1 … 1
      const ny = (e.clientY / window.innerHeight - 0.5) * 2   // -1 … 1
      const ry =  nx * MAX_DEG
      const rx = -ny * MAX_DEG
      frame.style.setProperty('--lb-ry', ry.toFixed(2) + 'deg')
      frame.style.setProperty('--lb-rx', rx.toFixed(2) + 'deg')
      frame.style.setProperty('--lb-tx', (nx * MAX_TX).toFixed(1) + 'px')
      frame.style.setProperty('--lb-ty', (ny * MAX_TX).toFixed(1) + 'px')
    })
    lb.addEventListener('mouseleave', recenter)
  }
})()
