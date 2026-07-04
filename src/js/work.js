// Work page module — folder-driven numbered list (/work.json) with a floating
// crossfade centre image, cursor+scroll active selection, elastic divider
// lines, list↔grid toggle and a detail drawer.
//
// SPA-safe: every window/document listener and rAF loop is tracked and torn
// down in destroy() so nothing leaks or double-runs across barba transitions.

let list, grid, stage, section, drawer, dGallery, dInfo
let projects = [], rows = [], activeIndex = -1
let front = null, back = null, currentSrc = null
let drawerIndex = -1, lastFocused = null
let cleanup = []
let elasticRafId = 0, scrollRafId = 0

// ─── Crossfade double-buffer for the centre image ───────────────────────────
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
    const t = front; front = back; back = t
  }
  back.src = src
}

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
      '<span class="work__row-left">' +
        '<span class="work__row-arrow" aria-hidden="true">↘</span>' +
        '<span class="work__row-code">' + p.code + '.</span>' +
        '<span class="work__row-name">' + p.name + '</span>' +
      '</span>' +
      '<span class="work__row-right">' +
        '<span class="work__row-scale">' + (p.scale || '') + '</span>' +
        '<span class="work__row-date">' + (p.date || '') + '</span>' +
      '</span>' +
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
  syncToScroll()
  initElasticLines()
}

// ─── Elastic divider lines (port of ElasticLine.tsx) ────────────────────────
function initElasticLines () {
  if (!rows.length) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return

  const NS = 'http://www.w3.org/2000/svg'
  const SPRING_K = 0.06, DAMPING = 0.93, PROXIMITY = 55, MAX_DISP = 26
  const lines = []

  function addLine (row, isTop) {
    const svg = document.createElementNS(NS, 'svg')
    svg.setAttribute('class', 'work__row-line' + (isTop ? ' work__row-line--top' : ''))
    svg.setAttribute('aria-hidden', 'true')
    const path = document.createElementNS(NS, 'path')
    path.setAttribute('stroke', 'currentColor')
    path.setAttribute('stroke-width', '1')
    path.setAttribute('fill', 'none')
    path.setAttribute('d', 'M 0 0.5 L 1 0.5')
    svg.appendChild(path)
    row.appendChild(svg)
    lines.push({ svg, path, y: 0, vy: 0, cpx: 0, target: 0, w: 0, wasNear: false, straight: true })
  }
  rows.forEach((row, i) => { if (i === 0) addLine(row, true); addLine(row, false) })

  function measure () {
    for (const L of lines) { L.w = L.svg.getBoundingClientRect().width; L.path.setAttribute('d', 'M 0 0.5 L ' + L.w + ' 0.5') }
  }
  measure()

  let lastMouseY = 0, lastTime = 0, mouseVY = 0
  function onMove (e) {
    const now = Date.now()
    const dt = now - lastTime
    if (dt > 0 && dt < 80) mouseVY = (e.clientY - lastMouseY) / dt
    lastMouseY = e.clientY; lastTime = now
    for (const L of lines) {
      const rect = L.svg.getBoundingClientRect()
      const distY = e.clientY - (rect.top + 0.5)
      const inX = e.clientX >= rect.left && e.clientX <= rect.right
      const near = inX && Math.abs(distY) < PROXIMITY
      if (near) {
        L.cpx = e.clientX - rect.left
        L.target = Math.max(-MAX_DISP, Math.min(MAX_DISP, distY * 0.8))
      } else {
        if (L.wasNear) L.vy += mouseVY * 0.35
        L.target = 0
      }
      L.wasNear = near
    }
  }
  window.addEventListener('mousemove', onMove, { passive: true })
  window.addEventListener('resize', measure)
  cleanup.push(() => window.removeEventListener('mousemove', onMove))
  cleanup.push(() => window.removeEventListener('resize', measure))

  function tick () {
    for (const L of lines) {
      L.vy += (L.target - L.y) * SPRING_K
      L.vy *= DAMPING
      L.y += L.vy
      const flat = Math.abs(L.y) < 0.08 && Math.abs(L.vy) < 0.05
      if (!flat) {
        L.straight = false
        L.path.setAttribute('d', 'M 0 0.5 Q ' + L.cpx + ' ' + (0.5 + L.y) + ' ' + L.w + ' 0.5')
      } else if (!L.straight) {
        L.straight = true; L.y = 0; L.vy = 0
        L.path.setAttribute('d', 'M 0 0.5 L ' + L.w + ' 0.5')
      }
    }
    elasticRafId = requestAnimationFrame(tick)
  }
  elasticRafId = requestAnimationFrame(tick)
  section.classList.add('work--elastic')
}

// ─── Drivers: cursor + scroll ───────────────────────────────────────────────
function rowIndex (el) {
  const row = el.closest('.work__row')
  return row ? Number(row.dataset.index) : -1
}
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
let scrollQueued = false
function onScroll () {
  if (scrollQueued) return
  scrollQueued = true
  scrollRafId = requestAnimationFrame(() => { scrollQueued = false; syncToScroll() })
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
function bindOpen () {
  const open = (e) => {
    const fig = e.target.closest('.work__cell')
    const i = fig ? Number(fig.dataset.index) : rowIndex(e.target)
    if (i < 0) return
    openDrawer(i)
  }
  list.addEventListener('click', open)
  grid.addEventListener('click', open)
  list.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e) }
  })
}

// ─── Detail drawer ──────────────────────────────────────────────────────────
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
  drawer.addEventListener('click', (e) => {
    if (e.target.closest('[data-drawer-close]')) { closeDrawer(); return }
    if (e.target.closest('[data-prev]')) { step(-1); return }
    if (e.target.closest('[data-next]')) { step(1); return }
    if (e.target === dGallery) closeDrawer()
  })
  const onKey = (e) => {
    if (drawer.hidden) return
    if (e.key === 'Escape') closeDrawer()
    else if (e.key === 'ArrowRight') step(1)
    else if (e.key === 'ArrowLeft') step(-1)
  }
  document.addEventListener('keydown', onKey)
  cleanup.push(() => document.removeEventListener('keydown', onKey))

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
  dGallery.addEventListener('click', (e) => { if (moved > 4) { e.stopPropagation() } }, true)
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────
export function init () {
  list    = document.getElementById('work-list')
  grid    = document.getElementById('work-grid')
  stage   = document.getElementById('work-stage')
  section = document.querySelector('.work')
  drawer  = document.getElementById('work-drawer')
  dGallery = document.getElementById('drawer-gallery')
  dInfo   = drawer && drawer.querySelector('#drawer-info')
  if (!list || !grid || !stage || !section) return

  bindCursor()
  bindToggle()
  bindOpen()
  bindDrawer()

  window.addEventListener('scroll', onScroll, { passive: true })
  const onResize = () => syncToScroll()
  window.addEventListener('resize', onResize)
  cleanup.push(() => window.removeEventListener('scroll', onScroll))
  cleanup.push(() => window.removeEventListener('resize', onResize))

  fetch('/work.json', { cache: 'no-cache' })
    .then(r => r.ok ? r.json() : [])
    .then(render)
    .catch(() => render([]))

  window.biakoWork = { get projects () { return projects }, setActive, openDrawer, closeDrawer }
}

export function destroy () {
  cleanup.forEach(fn => fn()); cleanup = []
  cancelAnimationFrame(elasticRafId); elasticRafId = 0
  cancelAnimationFrame(scrollRafId); scrollRafId = 0
  document.body.style.overflow = ''
  projects = []; rows = []; activeIndex = -1
  front = back = null; currentSrc = null
  drawerIndex = -1; lastFocused = null
  scrollQueued = false
  delete window.biakoWork
}
