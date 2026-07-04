// Home carousel — fetch feed.json, render a duplicated set so the CSS marquee
// (translateX 0 → -50%) can loop seamlessly. Also wires the lightbox.

(function () {
  const track = document.getElementById('carousel-track')
  if (!track) return

  function cardHtml (item, i) {
    return (
      '<button class="carousel__card" type="button" data-src="' + item.src + '" ' +
        'aria-label="Open image ' + (i + 1) + '">' +
        '<img src="' + item.src + '" alt="" loading="lazy" decoding="async">' +
      '</button>'
    )
  }

  function render (items) {
    if (!items.length) {
      track.innerHTML = '<div class="carousel__empty">No pieces yet — drop images in /public/feed</div>'
      track.style.animation = 'none'
      return
    }
    const half = items.map(cardHtml).join('')
    track.innerHTML = half + half
    const cards = track.querySelectorAll('.carousel__card')
    for (let i = items.length; i < cards.length; i++) {
      cards[i].setAttribute('aria-hidden', 'true')
      cards[i].setAttribute('tabindex', '-1')
    }
  }

  fetch('/feed.json', { cache: 'no-cache' })
    .then(r => r.ok ? r.json() : [])
    .then(render)
    .catch(() => render([]))
})()

// ─── Lightbox — open on card click, perspective tilt, close on outside / Esc.
(function () {
  const lb    = document.getElementById('lightbox')
  const img   = document.getElementById('lightbox-img')
  const frame = document.getElementById('lightbox-frame')
  const track = document.getElementById('carousel-track')
  if (!lb || !img || !frame || !track) return

  const reduce  = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const MAX_DEG = 9

  function open (src) {
    img.src = src
    lb.hidden = false
    document.body.style.overflow = 'hidden'
    frame.style.setProperty('--lb-rx', '0deg')
    frame.style.setProperty('--lb-ry', '0deg')
  }
  function close () {
    lb.hidden = true
    img.src = ''
    document.body.style.overflow = ''
    frame.style.removeProperty('--lb-rx')
    frame.style.removeProperty('--lb-ry')
  }

  track.addEventListener('click', (e) => {
    const card = e.target.closest('.carousel__card')
    if (!card) return
    const src = card.getAttribute('data-src')
    if (src) open(src)
  })

  lb.addEventListener('click', (e) => {
    if (e.target.closest('[data-lightbox-close]')) close()
  })

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !lb.hidden) close()
  })

  if (!reduce) {
    frame.addEventListener('mousemove', (e) => {
      const rect = img.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const nx = Math.max(-1, Math.min(1, (e.clientX - cx) / (rect.width / 2)))
      const ny = Math.max(-1, Math.min(1, (e.clientY - cy) / (rect.height / 2)))
      const ry = nx * MAX_DEG
      const rx = -ny * MAX_DEG
      frame.style.setProperty('--lb-ry', ry.toFixed(2) + 'deg')
      frame.style.setProperty('--lb-rx', rx.toFixed(2) + 'deg')
    })
    frame.addEventListener('mouseleave', () => {
      frame.style.setProperty('--lb-rx', '0deg')
      frame.style.setProperty('--lb-ry', '0deg')
    })
  }
})()
