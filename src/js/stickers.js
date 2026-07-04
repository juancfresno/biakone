// Stickers — folder-driven vertical stack reading /stickers.json.
// The VFX-JS effect is out of scope for v0; the cells sit inside a
// [data-effect="vfx"] mount point a later phase can hydrate.

(function () {
  const mount = document.getElementById('stickers-grid')
  if (!mount) return

  function cellHtml (item) {
    return (
      '<figure class="stickers__cell">' +
        '<img src="' + item.src + '" alt="" loading="lazy" decoding="async">' +
      '</figure>'
    )
  }

  function render (items) {
    if (!items.length) {
      mount.innerHTML = '<p class="stickers__empty">No stickers yet — drop images in /public/stickers</p>'
      return
    }
    mount.innerHTML = items.map(cellHtml).join('')
  }

  fetch('/stickers.json', { cache: 'no-cache' })
    .then(r => r.ok ? r.json() : [])
    .then(render)
    .catch(() => render([]))
})()
