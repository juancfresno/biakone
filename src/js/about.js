// About — folder-driven horizontal photo strip (/about.json).
// Native wheel / trackpad / touch scrolling works out of the box; this adds
// click-drag panning for mouse users. The tag marquee + lightbox at the bottom
// are the shared tags component (see tags.js), loaded separately.

const strip = document.getElementById('about-gallery')

function cellHtml (item) {
  return (
    '<figure class="about-gallery__cell">' +
      '<img src="' + item.src + '" alt="" loading="lazy" decoding="async" draggable="false">' +
    '</figure>'
  )
}

function render (items) {
  if (!items.length) {
    strip.innerHTML = '<p class="about-gallery__empty">No photos yet — drop images in /public/about</p>'
    return
  }
  strip.innerHTML = items.map(cellHtml).join('')
}

// ─── Click-drag to pan (desktop nicety) ─────────────────────────────────────
function enableDrag (el) {
  let down = false, startX = 0, startScroll = 0, moved = 0

  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') return   // touch already pans natively
    down = true; moved = 0
    startX = e.clientX; startScroll = el.scrollLeft
    el.setPointerCapture(e.pointerId)
  })
  el.addEventListener('pointermove', (e) => {
    if (!down) return
    const dx = e.clientX - startX
    if (Math.abs(dx) > 3 && !el.classList.contains('is-dragging')) el.classList.add('is-dragging')
    moved = Math.max(moved, Math.abs(dx))
    el.scrollLeft = startScroll - dx
  })
  const end = (e) => {
    if (!down) return
    down = false
    el.classList.remove('is-dragging')
    try { el.releasePointerCapture(e.pointerId) } catch {}
  }
  el.addEventListener('pointerup', end)
  el.addEventListener('pointercancel', end)
  // Swallow the click that follows a real drag so it can't trigger anything.
  el.addEventListener('click', (e) => { if (moved > 4) { e.preventDefault(); e.stopPropagation() } }, true)
}

if (strip) {
  enableDrag(strip)
  fetch('/about.json', { cache: 'no-cache' })
    .then(r => r.ok ? r.json() : [])
    .then(render)
    .catch(() => render([]))
}
