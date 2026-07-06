// Work page module — folder-driven numbered list (/work.json) with a floating
// crossfade centre image, cursor+scroll active selection, elastic divider
// lines, list↔grid toggle and a detail drawer.
//
// SPA-safe: every window/document listener and rAF loop is tracked and torn
// down in destroy() so nothing leaks or double-runs across barba transitions.
//
// The grid (mosaic) view is a port of crnacura/PlayersClub: the tight
// grid-template-columns mosaic (ArtistGrid.astro), the staggered rise+fade
// entrance (scripts/index.js) and the cursor-following tooltip (scripts/
// tooltip.js) — adapted to vanilla + Biako tokens.

import gsap from 'gsap'

let list, grid, stage, section, drawer, dGallery, dInfo
let panel, backdrop, toolbar, gridTip
let projects = [], rows = [], activeIndex = -1
let stageImg = null, currentSrc = null
let drawerIndex = -1, lastFocused = null
let cleanup = []
let elasticRafId = 0, scrollRafId = 0
let tipBound = false
let currentView = 'list', pageEntered = false, rowsReady = false

// ─── Centre image — single preloaded <img> that VHS-glitches on each change ──
// The image is set once (project 01) and is NEVER cleared, so there is always a
// visible active project even when the cursor is off the list.
function buildStage () {
  stage.innerHTML = ''
  const SVGNS = 'http://www.w3.org/2000/svg'

  // Reusable RGB-split filter (VHS chromatic aberration), toggled by the glitch
  // keyframes. Lives inside the (swapped) stage so it's SPA-clean.
  const defs = document.createElementNS(SVGNS, 'svg')
  defs.setAttribute('class', 'work__stage-defs')
  defs.setAttribute('aria-hidden', 'true')
  defs.innerHTML =
    '<filter id="work-rgb" x="-8%" y="-8%" width="116%" height="116%">' +
      '<feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" result="r"/>' +
      '<feOffset in="r" dx="6" result="ro"/>' +
      '<feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0" result="g"/>' +
      '<feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0" result="b"/>' +
      '<feOffset in="b" dx="-6" result="bo"/>' +
      '<feBlend in="ro" in2="g" mode="screen" result="rg"/>' +
      '<feBlend in="rg" in2="bo" mode="screen"/>' +
    '</filter>'

  stageImg = document.createElement('img')
  stageImg.className = 'work__stage-img'
  stageImg.alt = ''
  stageImg.decoding = 'async'

  const scan = document.createElement('div')
  scan.className = 'work__stage-scan'
  scan.setAttribute('aria-hidden', 'true')

  stage.append(defs, stageImg, scan)
}

function showImage (src) {
  if (!src || src === currentSrc || !stageImg) return
  currentSrc = src
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const apply = () => {
    if (currentSrc !== src) return   // superseded by a faster hover
    stageImg.src = src
    stageImg.classList.add('is-shown')
    if (reduce) return               // plain fade via .is-shown, no glitch
    // Restart the one-shot glitch animation.
    stage.classList.remove('is-glitch')
    void stage.offsetWidth
    stage.classList.add('is-glitch')
  }

  // Decode first so the swap is instant (no flash) on cached or fresh images.
  const pre = new Image()
  pre.src = src
  if (pre.decode) pre.decode().then(apply).catch(apply)
  else { pre.onload = apply; pre.onerror = apply }
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
        '<span class="work__row-code">' + p.code + '</span>' +
        '<span class="work__row-name">' + p.name + '</span>' +
      '</span>' +
      '<span class="work__row-right">' +
        '<span class="work__row-type">' + (p.type || '') + '</span>' +
        '<span class="work__row-year">' + (p.year || '') + '</span>' +
      '</span>' +
    '</li>'
  )
}
function cellHtml (p) {
  const cover = p.images && p.images[0] ? p.images[0].src : '/work/_placeholder.webp'
  return (
    '<button class="work__cell" type="button" data-index="' + p._i + '" ' +
        'aria-label="' + p.code + ' ' + p.name + '">' +
      '<img src="' + cover + '" alt="' + p.name + '" loading="lazy" decoding="async" draggable="false">' +
      '<span class="work__cell-label"><span class="work__cell-num">' + p.code + '</span> ' + p.name + '</span>' +
    '</button>'
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
  setActive(0)   // default active = project 01, image visible immediately
  initElasticLines()

  // Hide the animatable items until the entrance plays (avoids a flash of the
  // full list during the page transition). Reduced-motion keeps them visible.
  if (!reduceMotion()) {
    gsap.set(rows, { autoAlpha: 0 })
    gsap.set(grid.querySelectorAll('.work__cell'), { autoAlpha: 0 })
  }

  // Restore the session's chosen view (list default) WITHOUT animating yet — the
  // entrance is triggered by entered() once the page transition finishes.
  let saved = 'list'
  try { saved = sessionStorage.getItem('biako-work-view') || 'list' } catch {}
  applyView(saved === 'grid' ? 'grid' : 'list', false)

  rowsReady = true
  maybeEnter()
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
// The toolbar lives in .work-head (a sibling of .work), so listen there and
// flip data-view on .work. The choice is remembered for the session.
function bindToggle () {
  if (!toolbar) return
  toolbar.addEventListener('click', (e) => {
    const btn = e.target.closest('.work__view-btn')
    if (btn) applyView(btn.dataset.view, true)   // toggling re-plays the entrance
  })
}
function applyView (view, animate) {
  currentView = view
  section.setAttribute('data-view', view)
  if (toolbar) toolbar.querySelectorAll('.work__view-btn').forEach(b =>
    b.setAttribute('aria-pressed', b.dataset.view === view ? 'true' : 'false'))
  try { sessionStorage.setItem('biako-work-view', view) } catch {}
  if (animate) requestAnimationFrame(() => runEntrance(view))
}

// ─── Entrance coordination ──────────────────────────────────────────────────
// The stagger must run AFTER the page-transition-in finishes (app.js calls
// entered()), not during it — so we hide the items on render and only play once
// BOTH the rows are ready and the page has fully entered.
function maybeEnter () {
  if (pageEntered && rowsReady) requestAnimationFrame(() => runEntrance(currentView))
}
export function entered () { pageEntered = true; maybeEnter() }
function runEntrance (view) { view === 'grid' ? enterGrid() : enterList() }

// List entrance — staggered fade + short rise, expo-out. Rows rest at 0.5 opacity
// (1 when active), so each animates to its own resting opacity, then hands styling
// back to CSS (clearProps) so hover/active dimming keeps working.
function enterList () {
  if (!rows.length) return
  if (reduceMotion()) { list.classList.remove('is-entering'); gsap.set(rows, { clearProps: 'opacity,transform,visibility' }); return }
  gsap.killTweensOf(rows)
  // Suppress the row's CSS opacity transition during the entrance — otherwise
  // gsap.set(opacity:0) would trigger a 0.5→0 CSS fade that fights the stagger.
  list.classList.add('is-entering')
  // Hide ALL rows first, so rows still waiting for their per-row delay don't sit
  // at their resting opacity and flicker when their tween starts.
  gsap.set(rows, { opacity: 0, y: 20, visibility: 'visible' })
  const last = rows.length - 1
  rows.forEach((row, i) => {
    const rest = row.classList.contains('is-active') ? 1 : 0.5
    gsap.to(row, {
      y: 0, opacity: rest, duration: 0.42, ease: 'expo.out', delay: i * 0.06,
      clearProps: 'opacity,transform,visibility',
      onComplete: i === last ? () => list.classList.remove('is-entering') : undefined,
    })
  })
}

// ─── Grid (mosaic) entrance — staggered rise + fade (index.js port) ─────────
function enterGrid () {
  initGridTooltip()
  const cells = grid.querySelectorAll('.work__cell')
  if (!cells.length) return
  if (reduceMotion()) { gsap.set(cells, { clearProps: 'all' }); return }
  gsap.killTweensOf(cells)
  gsap.fromTo(cells,
    { yPercent: 100, autoAlpha: 0 },
    { yPercent: 0, autoAlpha: 1, duration: 0.9, ease: 'power4', stagger: 0.05, overwrite: true })
}

function reduceMotion () { return window.matchMedia('(prefers-reduced-motion: reduce)').matches }

// ─── Cursor-following tooltip on hover (tooltip.js port) ────────────────────
function initGridTooltip () {
  if (tipBound || !grid) return
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
  // Cursor-following tooltip is a motion flourish — skip it under reduced-motion
  // (the card labels + drawer still carry the number/name/type).
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  tipBound = true

  gridTip = document.createElement('div')
  gridTip.className = 'work__tip'
  gridTip.setAttribute('aria-hidden', 'true')
  gridTip.innerHTML = '<span class="work__tip-name"></span><span class="work__tip-type"></span>'
  section.appendChild(gridTip)
  gsap.set(gridTip, { scale: 0, autoAlpha: 0, transformOrigin: '0% 100%' })

  const xTo = gsap.quickTo(gridTip, 'x', { duration: 0.55, ease: 'expo' })
  const yTo = gsap.quickTo(gridTip, 'y', { duration: 0.55, ease: 'expo' })
  let visible = false

  const place = (e) => {
    const w = gridTip.offsetWidth
    let x = e.clientX + 20
    if (x + w > window.innerWidth) x = e.clientX - 20 - w
    return { x, y: e.clientY + 4 }
  }

  const onMove = (e) => {
    if (!visible) return
    const { x, y } = place(e)
    xTo(x); yTo(y)
  }
  const onOver = (e) => {
    const cell = e.target.closest('.work__cell')
    if (!cell) return
    const p = projects[Number(cell.dataset.index)]
    if (!p) return
    gridTip.querySelector('.work__tip-name').textContent = p.code + ' ' + p.name
    gridTip.querySelector('.work__tip-type').textContent = [p.type, p.year].filter(Boolean).join(' · ')
    const { x, y } = place(e)
    if (!visible) {
      visible = true
      gsap.set(gridTip, { x, y })
      gsap.fromTo(gridTip, { scale: 0, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.55, ease: 'power4.inOut' })
    }
  }
  const onLeave = () => {
    visible = false
    gsap.to(gridTip, { scale: 0, autoAlpha: 0, duration: 0.4, ease: 'power4.inOut' })
  }

  grid.addEventListener('pointermove', onMove, { passive: true })
  grid.addEventListener('pointerover', onOver)
  grid.addEventListener('mouseleave', onLeave)
  cleanup.push(() => {
    grid.removeEventListener('pointermove', onMove)
    grid.removeEventListener('pointerover', onOver)
    grid.removeEventListener('mouseleave', onLeave)
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

// ─── Detail drawer (Phase 1: gallery + info) ────────────────────────────────
const EDGE = 0.2   // width fraction of the left/right prev/next image zones

function drawerImages () { return [...dGallery.querySelectorAll('.drawer__slide')] }
function currentImageIndex () {
  const slides = drawerImages(); const sl = dGallery.scrollLeft
  let best = 0, bd = Infinity
  slides.forEach((s, i) => { const d = Math.abs(s.offsetLeft - sl); if (d < bd) { bd = d; best = i } })
  return best
}
function scrollToImage (i) {
  const slides = drawerImages()
  if (!slides.length) return
  i = Math.max(0, Math.min(slides.length - 1, i))
  dGallery.scrollTo({ left: slides[i].offsetLeft, behavior: reduceMotion() ? 'auto' : 'smooth' })
}
function nextImage () { scrollToImage(currentImageIndex() + 1) }
function prevImage () { scrollToImage(currentImageIndex() - 1) }

// PHASE-2 HOOK — clicking a gallery image (not an edge, not a drag) will promote
// it to a full-height slider (drawer[data-mode="slider"]). Stubbed for now.
function zoomImage (/* i */) { /* Phase 2 */ }

function fillDrawer (i) {
  const p = projects[i]
  if (!p) return
  drawerIndex = i
  const imgs = p.images || []
  dGallery.innerHTML = imgs
    .map((im, n) => '<figure class="drawer__slide" data-img-index="' + n + '">' +
      '<img src="' + im.src + '" alt="' + p.name + '" draggable="false" decoding="async"></figure>')
    .join('')
  dGallery.scrollLeft = 0
  dGallery.scrollTop = 0
  dInfo.querySelector('[data-code]').textContent = p.code
  dInfo.querySelector('[data-name]').textContent = p.name
  dInfo.querySelector('[data-type]').textContent = p.type || ''
  dInfo.querySelector('[data-year]').textContent = p.year || ''
  dInfo.querySelector('[data-desc]').textContent = p.description || ''

  // Details list — from meta.details when present, else a sensible default.
  const hasPhotos = imgs[0] && !imgs[0].src.includes('_placeholder')
  const details = Array.isArray(p.details) && p.details.length ? p.details : [
    { label: 'Scale', value: '1:12' },
    { label: 'Images', value: hasPhotos ? String(imgs.length) : '—' },
  ]
  dInfo.querySelector('[data-details]').innerHTML = details
    .map(d => '<div><dt>' + d.label + '</dt><dd>' + d.value + '</dd></div>').join('')
}

let closing = false, openTl = null
function glitchPanel () {
  if (reduceMotion() || !panel) return
  panel.classList.remove('is-glitch')
  void panel.offsetWidth                 // reflow so the animation can restart
  panel.classList.add('is-glitch')
}
function openDrawer (i) {
  if (!drawer || !projects[i]) return
  lastFocused = document.activeElement
  fillDrawer(i)
  // Re-parent the drawer to <body> so it paints ABOVE the fixed nav/footer and,
  // being the one <body> child excluded from the page blur, stays sharp.
  if (drawer.parentElement !== document.body) document.body.appendChild(drawer)
  drawer.hidden = false
  closing = false                              // cancel any pending close
  document.body.classList.add('drawer-open')   // → blurs the page (work.css)
  document.body.style.overflow = 'hidden'

  const content = panel.querySelectorAll('.drawer__info-head, .drawer__info-body, .drawer__pager')
  if (openTl) openTl.kill()
  gsap.killTweensOf([panel, backdrop, dGallery, ...content])
  if (reduceMotion()) {
    gsap.set(backdrop, { autoAlpha: 1 })
    gsap.set(panel, { xPercent: 0 })
    gsap.set([dGallery, ...content], { clearProps: 'all' })
  } else {
    openTl = gsap.timeline()
      .set(backdrop, { autoAlpha: 0 })
      .set(panel, { xPercent: 100 })
      .set(dGallery, { autoAlpha: 0 })
      .set(content, { autoAlpha: 0, y: 16 })
      .to(backdrop, { autoAlpha: 1, duration: 0.35, ease: 'power1.out' }, 0)
      .to(panel, { xPercent: 0, duration: 0.55, ease: 'expo.out' }, 0)
      // content reveals with a subtle stagger as the panel lands
      .to(dGallery, { autoAlpha: 1, duration: 0.45, ease: 'power2.out' }, 0.18)
      .to(content, { autoAlpha: 1, y: 0, duration: 0.5, ease: 'expo.out', stagger: 0.07, clearProps: 'transform,opacity' }, 0.26)
      .add(glitchPanel, 0.42)            // light VHS accent on landing
  }
  drawer.querySelector('.overlay-close').focus()
}
function closeDrawer () {
  if (!drawer || drawer.hidden) return
  closing = true
  // Guarded so a re-open (openDrawer sets closing=false) cancels a pending finish,
  // and so the drawer always closes even if a tween's onComplete is dropped.
  const done = () => {
    if (!closing) return
    closing = false
    drawer.hidden = true; dGallery.innerHTML = ''; drawer.dataset.mode = 'gallery'
  }
  if (openTl) { openTl.kill(); openTl = null }    // stop the open timeline fighting the close
  document.body.classList.remove('drawer-open')   // → un-blurs the page
  document.body.style.overflow = ''
  if (reduceMotion()) { done() }
  else {
    gsap.killTweensOf([panel, backdrop])
    gsap.to(backdrop, { autoAlpha: 0, duration: 0.3, ease: 'power1.in' })
    gsap.to(panel, { xPercent: 100, duration: 0.4, ease: 'expo.in', onComplete: done })
    setTimeout(done, 460)                          // guaranteed finish (fallback)
  }
  if (lastFocused && lastFocused.focus) lastFocused.focus()
}
function step (dir) {
  if (!projects.length) return
  fillDrawer((drawerIndex + dir + projects.length) % projects.length)
}

function bindDrawer () {
  if (!drawer) return

  // Custom directional arrow cursors for the edge zones (encoded here so no
  // manual escaping). Falls back to w/e-resize via the CSS var default.
  const chev = (d) => 'url("data:image/svg+xml,' + encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='36' height='36'>" +
    "<path d='" + d + "' fill='none' stroke='#000' stroke-width='5' stroke-opacity='0.45' stroke-linecap='round' stroke-linejoin='round'/>" +
    "<path d='" + d + "' fill='none' stroke='#fff' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'/></svg>"
  ) + '") 18 18, w-resize'
  dGallery.style.setProperty('--cursor-prev', chev('M23 9 L12 18 L23 27'))
  dGallery.style.setProperty('--cursor-next', chev('M13 9 L24 18 L13 27').replace('w-resize', 'e-resize'))

  drawer.addEventListener('click', (e) => {
    if (e.target.closest('[data-drawer-close]')) { closeDrawer(); return }
    if (e.target.closest('[data-prev]')) { step(-1); return }
    if (e.target.closest('[data-next]')) { step(1); return }
  })
  const onKey = (e) => {
    if (drawer.hidden) return
    if (e.key === 'Escape') closeDrawer()
    else if (e.key === 'ArrowRight') step(1)
    else if (e.key === 'ArrowLeft') step(-1)
  }
  document.addEventListener('keydown', onKey)
  cleanup.push(() => document.removeEventListener('keydown', onKey))

  const mobileLayout = () => window.matchMedia('(max-width: 767px)').matches

  // Drag to scroll the gallery.
  let down = false, startX = 0, startScroll = 0, moved = 0
  dGallery.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || mobileLayout()) return
    down = true; moved = 0; startX = e.clientX; startScroll = dGallery.scrollLeft
    dGallery.setPointerCapture(e.pointerId)
  })
  dGallery.addEventListener('pointermove', (e) => {
    // Edge-zone detection → directional arrow cursor.
    if (!down && !mobileLayout()) {
      const r = dGallery.getBoundingClientRect()
      const rel = (e.clientX - r.left) / r.width
      dGallery.classList.toggle('is-edge-prev', rel < EDGE)
      dGallery.classList.toggle('is-edge-next', rel > 1 - EDGE)
    }
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
  dGallery.addEventListener('mouseleave', () => dGallery.classList.remove('is-edge-prev', 'is-edge-next'))

  // Click: edge zones page prev/next image; the middle is the Phase-2 zoom hook.
  dGallery.addEventListener('click', (e) => {
    if (moved > 4 || mobileLayout()) return
    const r = dGallery.getBoundingClientRect()
    const rel = (e.clientX - r.left) / r.width
    if (rel < EDGE) prevImage()
    else if (rel > 1 - EDGE) nextImage()
    else zoomImage(currentImageIndex())
  })
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────
export function init () {
  list    = document.getElementById('work-list')
  grid    = document.getElementById('work-grid')
  stage   = document.getElementById('work-stage')
  section = document.querySelector('.work')
  toolbar = document.querySelector('.work__toolbar')
  drawer  = document.getElementById('work-drawer')
  panel   = document.getElementById('drawer-panel')
  backdrop = drawer && drawer.querySelector('.drawer__backdrop')
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
  if (gridTip) { gsap.killTweensOf(gridTip); gridTip.remove(); gridTip = null }
  if (openTl) { openTl.kill(); openTl = null }
  closing = false
  document.body.style.overflow = ''
  document.body.classList.remove('drawer-open')          // drop the page blur
  // The drawer was re-parented to <body>; remove it so it doesn't outlive the page.
  if (drawer && drawer.parentElement === document.body) drawer.remove()
  drawer = panel = backdrop = dGallery = dInfo = null
  projects = []; rows = []; activeIndex = -1
  stageImg = null; currentSrc = null
  drawerIndex = -1; lastFocused = null
  scrollQueued = false; tipBound = false; toolbar = null
  pageEntered = false; rowsReady = false; currentView = 'list'
  delete window.biakoWork
}
