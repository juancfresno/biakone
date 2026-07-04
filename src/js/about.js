// About page module — folder-driven horizontal photo strip (/about.json) with
// click-drag panning, plus the shared tag marquee + lightbox at the bottom.
// All strip listeners live on the swapped element (GC'd on leave); the tags
// component cleans up its own document listeners via destroyTags().
import { initTags, destroyTags } from './tags.js'

function cellHtml (item) {
  // --ar = crop aspect (w/h); cells flex-grow by it so the strip fills 100%.
  const ar = item.w && item.h ? (item.w / item.h).toFixed(4) : '0.5625'
  return (
    '<figure class="about-gallery__cell" style="--ar:' + ar + '">' +
      '<img src="' + item.src + '" alt="" loading="lazy" decoding="async" draggable="false">' +
    '</figure>'
  )
}

// ─── Click-drag to pan (desktop nicety) ─────────────────────────────────────
function enableDrag (el) {
  let down = false, startX = 0, startScroll = 0, moved = 0
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') return
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
  el.addEventListener('click', (e) => { if (moved > 4) { e.preventDefault(); e.stopPropagation() } }, true)
}

export function init () {
  const strip = document.getElementById('about-gallery')
  if (strip) {
    enableDrag(strip)
    fetch('/about.json', { cache: 'no-cache' })
      .then(r => r.ok ? r.json() : [])
      .then(items => {
        strip.innerHTML = items.length
          ? items.map(cellHtml).join('')
          : '<p class="about-gallery__empty">No photos yet — drop images in /public/about</p>'
      })
      .catch(() => {})
  }
  initTags()
}

export function destroy () {
  destroyTags()
}
