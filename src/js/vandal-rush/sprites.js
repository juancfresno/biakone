// Vandal Rush — sprite / atlas system.
//
// Drop-in for real pixel-art later. The game asks for animations by name
// (e.g. "writer-run") and this resolves the right frame from a sheet. Until an
// atlas is present it reports not-ready, so the game keeps drawing its
// placeholder rects — nothing blocks on final art.
//
// Atlas format (public/lab/vandal-rush/sprites/atlas.json) — see atlas.example.json:
//   {
//     "image": "sprites.png",         // sheet next to the json
//     "frameSize": [28, 32],          // grid cell size (omit for free-form frames)
//     "anims": {
//       "writer-run":  { "fps": 12, "frames": [[0,1],[1,1],[2,1],[3,1]] },  // [col,row]
//       "writer-jump": { "fps": 0,  "frames": [[0,2]] }                     // fps 0 = static
//     }
//   }
// Free-form (no frameSize): frames are [x, y, w, h] in pixels.
// `scale` (optional, default 1) pre-scales frame → world units if the sheet is
// authored larger than the in-game size.

export function createSprites () {
  let img = null
  let atlas = null
  let ready = false

  async function load (jsonUrl) {
    ready = false; img = null; atlas = null
    let data
    try {
      const res = await fetch(jsonUrl, { cache: 'no-cache' })
      if (!res.ok) return false                    // no atlas yet → placeholders
      data = await res.json()
    } catch { return false }
    if (!data || !data.image || !data.anims) return false
    const base = jsonUrl.replace(/[^/]+$/, '')
    try {
      const el = new Image()
      await new Promise((ok, no) => { el.onload = ok; el.onerror = no; el.src = base + data.image })
      img = el; atlas = data; ready = true
      return true
    } catch { img = null; atlas = null; ready = false; return false }
  }

  function has (name) { return !!(ready && atlas.anims[name]) }

  // Resolve the frame index for an animation given elapsed time (ms) or an index.
  function frameIndex (a, tOrIdx) {
    const n = a.frames.length
    if (a.fps && n > 1) return Math.floor((tOrIdx / 1000) * a.fps) % n
    return Math.max(0, Math.min(n - 1, tOrIdx | 0))
  }

  // Draw an anim frame into the destination rect. Returns false if the atlas
  // can't serve it (→ caller draws its placeholder). `flip` mirrors horizontally.
  function draw (ctx, name, tOrIdx, dx, dy, dw, dh, flip) {
    const a = has(name) && atlas.anims[name]
    if (!a) return false
    const f = a.frames[frameIndex(a, tOrIdx)]
    let sx, sy, sw, sh
    if (atlas.frameSize) {
      const [fw, fh] = atlas.frameSize
      sx = f[0] * fw; sy = f[1] * fh; sw = fw; sh = fh
    } else {
      sx = f[0]; sy = f[1]; sw = f[2]; sh = f[3]
    }
    if (flip) {
      ctx.save()
      ctx.translate(dx + dw, dy); ctx.scale(-1, 1)
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh)
      ctx.restore()
    } else {
      ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh)
    }
    return true
  }

  return {
    load, has, draw,
    get ready () { return ready },
    destroy () { img = null; atlas = null; ready = false },
  }
}
