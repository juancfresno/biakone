// Work — folder-driven list + grid, reading /work.json.
// The Figma "wave-text" effect is out of scope for v0; the list rows are
// wrapped in [data-effect="wavetext"] mount points a later phase can hydrate.

(function () {
  const list = document.getElementById('work-list')
  const grid = document.getElementById('work-grid')
  const section = document.querySelector('.work')
  if (!list || !grid || !section) return

  function pad2 (n) { return String(n).padStart(2, '0') }

  function rowHtml (item, i) {
    const code = pad2(i + 1)
    const name = item.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]/g, ' ')
    return (
      '<li class="work__row" data-src="' + item.src + '" tabindex="0">' +
        '<span class="work__row-code">↘ ' + code + '</span>' +
        '<span class="work__row-name">' + name + '</span>' +
        '<span class="work__row-scale">1:12</span>' +
        '<span class="work__row-date">—</span>' +
      '</li>'
    )
  }
  function cellHtml (item, i) {
    return (
      '<figure class="work__cell" data-src="' + item.src + '">' +
        '<img src="' + item.src + '" alt="" loading="lazy" decoding="async">' +
        '<figcaption class="work__cell-code">BK-' + pad2(i + 1) + '</figcaption>' +
      '</figure>'
    )
  }

  function render (items) {
    if (!items.length) {
      list.innerHTML = '<li class="work__empty">No pieces yet — drop images in /public/work</li>'
      grid.innerHTML = '<div class="work__empty">No pieces yet — drop images in /public/work</div>'
      return
    }
    list.innerHTML = items.map(rowHtml).join('')
    grid.innerHTML = items.map(cellHtml).join('')
  }

  // View toggle
  section.addEventListener('click', (e) => {
    const btn = e.target.closest('.work__view-btn')
    if (!btn) return
    const view = btn.dataset.view
    section.setAttribute('data-view', view)
    section.querySelectorAll('.work__view-btn').forEach(b => {
      b.setAttribute('aria-pressed', b === btn ? 'true' : 'false')
    })
  })

  fetch('/work.json', { cache: 'no-cache' })
    .then(r => r.ok ? r.json() : [])
    .then(render)
    .catch(() => render([]))
})()
