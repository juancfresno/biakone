// Stickers — folder-driven photo stack (/stickers.json) with a per-image CRT +
// wide-angle FISHEYE, built on VFX-JS (@vfx-js/core).
//
// The effect is applied as a PER-ELEMENT shader (vfx.add(img, { shader })) — NOT
// a viewport post-effect. That's the whole point: the barrel/fisheye is computed
// in each image's own space (uv = (gl_FragCoord - offset) / resolution, VFX-JS's
// per-element convention), so the lens curve BELONGS to each sticker and is
// identical for every one, regardless of scroll. (The old post-effect distorted
// the fixed viewport, so images looked flat and a curved layer floated on top.)
//
// Progressive enhancement: markup is plain <img>. The effect only layers on when
// WebGL is available AND reduced-motion is off; otherwise the untouched photos
// remain visible. Live tuning from the console:
//   biakoStickers.set({ fisheye: 1.4, overscan: 0.1, scan: 0.5 })

import { VFX } from '@vfx-js/core'

// ─── Tunable parameters (master → uniforms below) ──────────────────────────
// fisheye is the headline knob: barrel strength = fisheye × BARREL_MAX (in-shader).
const TUNE = {
  fisheye:    0.55,   // desktop — a clear, intact CRT curve (kept moderate)
  overscan:   0.14,   // zoom that lets the bulge FILL the frame; corners stay black
  aberration: 0.6,    // RGB fringing, grows toward the edge (lens)
  scan:       0.5,    // horizontal CRT scanline strength
  scanCount:  240.0,  // scanline density per image
  vignette:   0.5,    // corner darkening → lens vignette
  dither:     0.04,   // fine grain
}
// MOBILE goes HARD — an aggressive GoPro/VX1000 wide-angle: heavy edge curve,
// centre bulges toward the viewer, corners drop into black. Lighter scan/count
// than desktop to hold 60fps at pixelRatio 1.
const MOBILE = { fisheye: 1.15, overscan: 0.11, aberration: 0.5, scan: 0.42, scanCount: 150.0, vignette: 0.72, dither: 0.035 }

// ─── Per-image CRT + fisheye shader (GLSL3 / WebGL2, VFX-JS per-element) ──────
// uv is element-local [0,1]. Barrel is CONVEX (outward): the sample coordinate is
// pushed away from centre with radius² so the centre magnifies (bulges toward the
// viewer) and the edges/corners curve away past the texture → black. `overscan`
// zooms back in so the bulge fills the frame while the corners still fall to black.
const CRT_SHADER = /* glsl */ `
precision highp float;
uniform vec2 offset;
uniform vec2 resolution;
uniform sampler2D src;
uniform float time;
uniform float uFisheye, uOverscan, uAberration, uScan, uScanCount, uVignette, uDither;
out vec4 outColor;

// Internal ceiling — visible barrel strength = uFisheye * BARREL_MAX.
const float BARREL_MAX = 1.9;

// Sample the image, transparent outside its bounds so the lens edges fall to the
// dark page behind (the cell bg is #141414).
vec4 tex(vec2 uv) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);
  return texture(src, uv);
}
float rand(vec2 p) { return fract(sin(dot(p, vec2(829.3, 483.7))) * 39428.0); }

void main() {
  vec2 uv = (gl_FragCoord.xy - offset) / resolution;   // element-local [0,1]
  float scanY = uv.y;                                  // flat scanlines (pre-distortion)

  // Aspect-corrected radius so the lens is circular, not oval.
  vec2 c = uv - 0.5;
  c.x *= resolution.x / resolution.y;
  float r2 = dot(c, c);
  float k  = uFisheye * BARREL_MAX;

  // CONVEX barrel: push the sample outward with r² (centre magnifies, edges curve
  // away). Then overscan (zoom in) so the picture fills the frame; corners spill.
  vec2 duv = 0.5 + (uv - 0.5) * (1.0 + k * r2);
  duv = 0.5 + (duv - 0.5) / (1.0 + k * uOverscan);

  // Chromatic aberration that intensifies toward the edge — a lens tell.
  vec2 dir = duv - 0.5;
  float ab = uAberration * (0.004 + 0.03 * r2);
  vec4 cr = tex(duv + dir * ab);
  vec4 cg = tex(duv);
  vec4 cb = tex(duv - dir * ab);
  outColor = vec4(cr.r, cg.g, cb.b, max(cr.a, max(cg.a, cb.a)));

  // Pronounced CRT scanlines (per image).
  float scan = 0.5 - 0.5 * cos(scanY * uScanCount * 6.28318);
  outColor.rgb *= 1.0 - uScan * scan;

  // Lens vignette — corners fall into black.
  float vig = smoothstep(1.2, 0.15, length(c) * 2.0);
  outColor.rgb *= mix(1.0, vig, uVignette);

  // Fine grain.
  outColor.rgb += (rand(gl_FragCoord.xy + fract(time)) - 0.5) * uDither;
}
`

// ─── Render the folder-driven stack ────────────────────────────────────────
function cellHtml (item) {
  // Native intrinsic size → VFX-JS maps the texture to the element rect, keeping
  // the real aspect ratio (verticals tall, horizontals short) so nothing warps.
  const dim = (item.w && item.h) ? ' width="' + item.w + '" height="' + item.h + '"' : ''
  return (
    '<figure class="stickers__cell">' +
      '<img src="' + item.src + '"' + dim + ' alt="" loading="lazy" decoding="async">' +
    '</figure>'
  )
}

// Per-mount VFX instance so we can tear it down on leave (WebGL / rAF cleanup).
let vfx = null
let cfg = { ...TUNE }

function initEffect (imgs) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduce || !imgs.length) return

  const isMobile = window.matchMedia('(max-width: 640px)').matches
  cfg = { ...TUNE, ...(isMobile ? MOBILE : {}) }

  // pixelRatio 1 keeps the scanlines discrete and the passes cheap → 60fps.
  vfx = VFX.init({ pixelRatio: 1, zIndex: 2 })
  if (!vfx) return  // no WebGL → plain photos stay visible

  const uniforms = {
    uFisheye:    () => cfg.fisheye,
    uOverscan:   () => cfg.overscan,
    uAberration: () => cfg.aberration,
    uScan:       () => cfg.scan,
    uScanCount:  () => cfg.scanCount,
    uVignette:   () => cfg.vignette,
    uDither:     () => cfg.dither,
  }

  // Each image carries the CRT+fisheye as its OWN shader → per-image lens curve,
  // uniform across the whole stack. `release` keeps a cell rendering briefly after
  // it scrolls off so the effect never pops.
  const addOne = (img) => {
    const go = () => vfx && vfx.add(img, { shader: CRT_SHADER, uniforms, release: 600 })
      .catch(() => { img.style.opacity = '' })
    if (img.complete && img.naturalWidth) go()
    else img.addEventListener('load', go, { once: true })
  }
  imgs.forEach(addOne)

  // Live tuning: biakoStickers.set({ fisheye: 1.4, overscan: 0.1 })
  window.biakoStickers = {
    tune: cfg,
    set (patch) { if (patch && typeof patch === 'object') Object.assign(cfg, patch) },
    vfx,
  }
}

export function init () {
  const mount = document.getElementById('stickers-grid')
  if (!mount) return
  fetch('/stickers.json', { cache: 'no-cache' })
    .then(r => r.ok ? r.json() : [])
    .then(items => {
      if (!items.length) { mount.innerHTML = '<p class="stickers__empty">No stickers yet — drop images in /public/stickers</p>'; return }
      mount.innerHTML = items.map(cellHtml).join('')
      initEffect([...mount.querySelectorAll('.stickers__cell img')])
    })
    .catch(() => {})
}

export function destroy () {
  // Tear down the WebGL context + rAF and remove the fixed canvas VFX appended
  // to <body> (it lives outside the swapped container, so it must be removed).
  if (vfx) {
    try { vfx.destroy() } catch {}
    vfx = null
  }
  delete window.biakoStickers
}
