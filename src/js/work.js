// Work — folder-driven numbered project list (/work.json) with a floating
// centre image that crossfades to the ACTIVE project. Active selection is
// driven by BOTH cursor (hovering a row) and scroll (the row nearest the
// viewport centre). List ↔ grid toggle. Clicking a project opens the detail
// drawer (added in the drawer phase).

const list    = document.getElementById('work-list')
const grid    = document.getElementById('work-grid')
const stage   = document.getElementById('work-stage')
const section = document.querySelector('.work')

let projects = []
let rows = []
let activeIndex = -1

// ─── Crossfade double-buffer for the centre image ───────────────────────────
let front = null, back = null, currentSrc = null
function buildStage () {
  front = document.createElement('img'); front.className = 'work__stage-img'
  back  = document.createElement('img'); back.className  = 'work__stage-img'
  front.alt = ''; back.alt = ''
  front.decoding = 'async'; back.decoding = 'async'
  stage.append(front, back)
}
function showImage (src) {
  if (!src || src === currentSrc) return
  currentSrc = src
  back.onload = () => {
    back.classList.add('is-shown')
    front.classList.remove('is-shown')
    const t = front; front = back; back = t   // swap roles
  }
  back.src = src
}

// ─── Active project ─────────────────────────────────────────────────────────
function setActive (i) {
  if (i < 0 || i >= projects.length || i === activeIndex) return
  activeIndex = i
  for (let r = 0; r < rows.length; r++) rows[r].classList.toggle('is-active', r === i)
  const p = projects[i]
  if (p.images && p.images[0]) showImage(p.images[0].src)
}

// ─── Markup ─────────────────────────────────────────────────────────────────
function rowHtml (p) {
  return (
    '<li class="work__row" data-index="' + p._i + '" tabindex="0" role="button" ' +
        'aria-label="' + p.name + '">' +
      '<span class="work__row-arrow" aria-hidden="true">↘</span>' +
      '<span class="work__row-code">' + p.code + '.</span>' +
      '<span class="work__row-name">' + p.name + '</span>' +
      '<span class="work__row-scale">' + (p.scale || '') + '</span>' +
      '<span class="work__row-date">' + (p.date || '') + '</span>' +
    '</li>'
  )
}
function cellHtml (p) {
  const cover = p.images && p.images[0] ? p.images[0].src : ''
  return (
    '<figure class="work__cell" data-index="' + p._i + '">' +
      '<img src="' + cover + '" alt="' + p.name + '" loading="lazy" decoding="async">' +
      '<figcaption class="work__cell-meta">' +
        '<span>' + p.code + '. ' + p.name + '</span>' +
        '<span>' + (p.scale || '') + '</span>' +
      '</figcaption>' +
    '</figure>'
  )
}

function render (items) {
  projects = items.map((p, i) => ({ ...p, _i: i }))
  if (!projects.length) {
    list.innerHTML = '<li class="work__empty">No pieces yet — add a folder in /public/work</li>'
    grid.innerHTML = '<div class="work__empty">No pieces yet — add a folder in /public/work</div>'
    return
  }
  list.innerHTML = projects.map(rowHtml).join('')
  grid.innerHTML = projects.map(cellHtml).join('')
  rows = [...list.querySelectorAll('.work__row')]
  buildStage()
  setActive(0)
  syncToScroll()   // pick the row nearest the viewport centre on load
}

// ─── Drivers: cursor + scroll ───────────────────────────────────────────────
function rowIndex (el) {
  const row = el.closest('.work__row')
  return row ? Number(row.dataset.index) : -1
}

// Cursor: hovering a row activates it.
function bindCursor () {
  list.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return
    const i = rowIndex(e.target)
    if (i >= 0) setActive(i)
  })
  list.addEventListener('focusin', (e) => {
    const i = rowIndex(e.target)
    if (i >= 0) setActive(i)
  })
}

// Scroll: the row whose centre is nearest the viewport centre wins.
let scrollQueued = false
function syncToScroll () {
  if (!rows.length) return
  const mid = window.innerHeight / 2
  let best = 0, bestDist = Infinity
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i].getBoundingClientRect()
    const d = Math.abs((r.top + r.bottom) / 2 - mid)
    if (d < bestDist) { bestDist = d; best = i }
  }
  setActive(best)
}
function onScroll () {
  if (scrollQueued) return
  scrollQueued = true
  requestAnimationFrame(() => { scrollQueued = false; syncToScroll() })
}

// ─── View toggle ────────────────────────────────────────────────────────────
function bindToggle () {
  section.addEventListener('click', (e) => {
    const btn = e.target.closest('.work__view-btn')
    if (!btn) return
    section.setAttribute('data-view', btn.dataset.view)
    section.querySelectorAll('.work__view-btn').forEach(b =>
      b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'))
  })
}

// ─── Row / cell click → detail drawer ───────────────────────────────────────
// work-drawer.js (drawer phase) listens for this event.
function bindOpen () {
  const open = (e) => {
    const fig = e.target.closest('.work__cell')
    const i = fig ? Number(fig.dataset.index) : rowIndex(e.target)
    if (i < 0) return
    window.dispatchEvent(new CustomEvent('work:open', { detail: { index: i, projects } }))
  }
  list.addEventListener('click', open)
  grid.addEventListener('click', open)
  list.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e) }
  })
}

// ─── Detail drawer ──────────────────────────────────────────────────────────
const drawer  = document.getElementById('work-drawer')
const dGallery = document.getElementById('drawer-gallery')
const dInfo   = drawer && drawer.querySelector('#drawer-info')
let drawerIndex = -1
let lastFocused = null

function fillDrawer (i) {
  const p = projects[i]
  if (!p) return
  drawerIndex = i
  dGallery.innerHTML = (p.images || [])
    .map(im => '<img src="' + im.src + '" alt="' + p.name + '" draggable="false" decoding="async">')
    .join('')
  dGallery.scrollLeft = 0
  dGallery.scrollTop = 0
  dInfo.querySelector('[data-code]').textContent  = p.code + '.'
  dInfo.querySelector('[data-name]').textContent  = p.name
  dInfo.querySelector('[data-scale]').textContent = p.scale || ''
  dInfo.querySelector('[data-date]').textContent  = p.date || ''
  dInfo.querySelector('[data-desc]').textContent  = p.description || ''
}

function openDrawer (i) {
  if (!drawer || !projects[i]) return
  lastFocused = document.activeElement
  fillDrawer(i)
  drawer.hidden = false
  requestAnimationFrame(() => drawer.classList.add('is-open'))
  document.body.style.overflow = 'hidden'
  drawer.querySelector('.drawer__close').focus()
}
function closeDrawer () {
  if (!drawer || drawer.hidden) return
  drawer.classList.remove('is-open')
  const done = () => {
    drawer.hidden = true
    dGallery.innerHTML = ''
    drawer.removeEventListener('transitionend', done)
  }
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduce) done(); else drawer.addEventListener('transitionend', done)
  document.body.style.overflow = ''
  if (lastFocused && lastFocused.focus) lastFocused.focus()
}
function step (dir) {
  if (!projects.length) return
  fillDrawer((drawerIndex + dir + projects.length) % projects.length)
}

function bindDrawer () {
  if (!drawer) return
  window.addEventListener('work:open', (e) => openDrawer(e.detail.index))

  drawer.addEventListener('click', (e) => {
    if (e.target.closest('[data-drawer-close]')) { closeDrawer(); return }
    if (e.target.closest('[data-prev]')) { step(-1); return }
    if (e.target.closest('[data-next]')) { step(1); return }
    // Click on the gallery background (not an image, not the info box) closes.
    if (e.target === dGallery) closeDrawer()
  })
  document.addEventListener('keydown', (e) => {
    if (drawer.hidden) return
    if (e.key === 'Escape') closeDrawer()
    else if (e.key === 'ArrowRight') step(1)
    else if (e.key === 'ArrowLeft') step(-1)
  })

  // Click-drag to pan the horizontal gallery (desktop).
  let down = false, startX = 0, startScroll = 0, moved = 0
  dGallery.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') return
    down = true; moved = 0; startX = e.clientX; startScroll = dGallery.scrollLeft
    dGallery.setPointerCapture(e.pointerId)
  })
  dGallery.addEventListener('pointermove', (e) => {
    if (!down) return
    const dx = e.clientX - startX
    if (Math.abs(dx) > 3) dGallery.classList.add('is-dragging')
    moved = Math.max(moved, Math.abs(dx))
    dGallery.scrollLeft = startScroll - dx
  })
  const end = (e) => {
    if (!down) return
    down = false; dGallery.classList.remove('is-dragging')
    try { dGallery.releasePointerCapture(e.pointerId) } catch {}
  }
  dGallery.addEventListener('pointerup', end)
  dGallery.addEventListener('pointercancel', end)
  // Swallow the click after a real drag so it can't close the drawer.
  dGallery.addEventListener('click', (e) => { if (moved > 4) { e.stopPropagation() } }, true)
}

if (list && grid && stage && section) {
  bindCursor()
  bindToggle()
  bindOpen()
  bindDrawer()
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', () => { syncToScroll() })

  fetch('/work.json', { cache: 'no-cache' })
    .then(r => r.ok ? r.json() : [])
    .then(render)
    .catch(() => render([]))

  // Expose for debugging / external control.
  window.biakoWork = { get projects () { return projects }, setActive, openDrawer, closeDrawer }
}
