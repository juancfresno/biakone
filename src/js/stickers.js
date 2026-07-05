// Stickers — folder-driven photo stack (/stickers.json) rendered through a CRT
// effect from VFX-JS (@vfx-js/core).
//
// The CRT is fand's (Yusuke Nakaya, the author of VFX-JS) — his shader from the
// MIT-licensed repo github.com/fand/vfx-js (packages/examples/works/crt.html),
// applied as a VFX `postEffect` exactly as he does. This is the library's real
// CRT, NOT a reimplementation. Retuned for Biako via uniforms (subtler glitch,
// moderate barrel, stronger scanlines); every knob is a live-tunable uniform.
//
// Progressive enhancement: markup is plain <img>. The effect only layers on when
// WebGL is available AND reduced-motion is off; otherwise the untouched photos
// remain visible. Live tuning from the console:
//   biakoStickers.set({ scan: 0.7, fisheye: 0.5, aberration: 0.1 })
//   biakoStickers.tune

import { VFX } from '@vfx-js/core'

// ─── Tunable parameters (master → uniforms below) ──────────────────────────
const TUNE = {
  fisheye:    0.4,    // barrel / lens bulge (× BARREL_MAX in-shader) — strong CRT curve
  aberration: 0.06,   // RGB shift / chromatic — subtle
  glitch:     0.05,   // glitch bands + radial jitter — subtle
  scan:       0.5,    // horizontal TV scanline strength — pronounced
  scanCount:  240.0,  // scanline density (lines across the viewport)
  vignette:   0.22,   // corner darkening / CRT bloom
  dither:     0.05,   // fine grain
}
// Mobile is lighter (softer bulge/scan, cheaper) to hold 60fps.
const MOBILE = { fisheye: 0.3, aberration: 0.04, glitch: 0.03, scan: 0.38, scanCount: 150.0, vignette: 0.16, dither: 0.03 }

// ─── CRT post-effect shader — fand's (MIT, github.com/fand/vfx-js), retuned ──
// fand's barrel + readTex + chromatic aberration + glitch bands are kept; each
// term is driven by its own uniform, and his interference "deco" is replaced by
// a clean, pronounced horizontal scanline (screen-space) per the design.
const CRT_SHADER = /* glsl */ `
precision highp float;
uniform sampler2D src;
uniform vec2 offset;
uniform vec2 resolution;
uniform float time;
uniform float uFisheye, uAberration, uGlitch, uScan, uScanCount, uVignette, uDither;
out vec4 outColor;

// Internal barrel ceiling — the bulge strength = uFisheye * BARREL_MAX.
// Raise this for an even stronger possible curve (default fisheye is set in JS).
const float BARREL_MAX = 3.0;

vec4 readTex(vec2 uv) {
  vec4 c = texture(src, uv);
  c.a *= smoothstep(.5, .499, abs(uv.x - .5)) * smoothstep(.5, .499, abs(uv.y - .5));
  return c;
}
vec2 zoom(vec2 uv, float t) { return (uv - .5) * t + .5; }
float rand(vec2 p) { return fract(sin(dot(p, vec2(829., 483.))) * 394.); }
float rand(vec3 p) { return fract(sin(dot(p, vec3(829., 4839., 432.))) * 39428.); }

void main() {
  vec2 uv = (gl_FragCoord.xy - offset) / resolution;
  vec2 screenUV = uv;                 // pre-distortion — for flat scanlines

  vec2 p = uv * 2. - 1.;
  p.x *= resolution.x / resolution.y;
  float l = length(p);

  // barrel / fisheye bulge (whole viewport) — convex CRT lens.
  // f = 1 / (1 + k·r²): smooth, never flips, and scales cleanly with uFisheye
  // (no dampening cap), so higher biakoStickers.set({fisheye}) really curves more.
  vec2 bc = uv - 0.5;
  bc.x *= resolution.x / resolution.y;
  float br2 = dot(bc, bc);
  uv = 0.5 + (uv - 0.5) / (1.0 + uFisheye * BARREL_MAX * br2);

  // gentle radial jitter (part of the glitch)
  float a = atan(p.y, p.x);
  float rd = rand(vec3(a, time, 0));
  uv = (uv - .5) * (1.0 + rd * pow(l * 0.7, 3.) * 0.3 * uGlitch) + .5;

  vec2 uvr = uv, uvg = uv, uvb = uv;

  // chromatic aberration (subtle)
  float d = (1. + sin(uv.y * 20. + time * 3.) * 0.1) * 0.05 * uAberration;
  uvr.x += 0.0015 * uAberration;
  uvb.x -= 0.0015 * uAberration;
  uvr = zoom(uvr, 1. + d * l * l);
  uvb = zoom(uvb, 1. - d * l * l);

  // glitch bands (subtle)
  float gr = rand(vec2(floor(time * 43.), 1.));
  if (gr > 0.8) {
    float y = sin(floor(uv.y / 0.07)) + sin(floor(uv.y / 0.003 + time));
    float f = rand(vec2(y, floor(time * 5.0))) * 2. - 1.;
    uvr.x += f * 0.05 * uGlitch;
    uvg.x += f * 0.1 * uGlitch;
    uvb.x += f * 0.15 * uGlitch;
  }
  float gr2 = rand(vec2(floor(time * 37.), 10.));
  if (gr2 > 0.9) {
    uvr.x += sin(uv.y * 7. + time + 1.) * 0.015 * uGlitch;
    uvg.x += sin(uv.y * 5. + time + 2.) * 0.015 * uGlitch;
    uvb.x += sin(uv.y * 3. + time + 3.) * 0.015 * uGlitch;
  }

  vec4 cr = readTex(uvr);
  vec4 cg = readTex(uvg);
  vec4 cb = readTex(uvb);
  outColor = vec4(cr.r, cg.g, cb.b, (cr.a + cg.a + cb.a));

  // pronounced horizontal TV scanlines (flat, screen-space)
  float scan = 0.5 - 0.5 * cos(screenUV.y * uScanCount * 6.28318);
  outColor.rgb *= 1.0 - uScan * scan;

  // faint CRT ambient across the WHOLE viewport (incl. the dark surround) so the
  // barrel curvature + scanlines read edge-to-edge, not only on the photo.
  float amb = 0.022 * smoothstep(1.85, 0.1, l) * (1.0 - uScan * scan);
  outColor.rgb += amb * (1.0 - outColor.a);
  outColor.a = max(outColor.a, amb * 2.2);

  // vignette / bloom
  outColor *= mix(1.0, 1.8 - l * l, uVignette);

  // dither
  outColor += rand(vec3(p, time)) * uDither;
}
`

// ─── Render the folder-driven stack ────────────────────────────────────────
function cellHtml (item) {
  // Native intrinsic size → the browser (and VFX-JS, which maps the texture to
  // the element rect) keeps the real aspect ratio, so photos never warp.
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

  // init like fand: a global CRT post-effect over everything we add.
  // pixelRatio 1 keeps the scanlines as discrete lines (not a sub-pixel moiré)
  // and keeps the single WebGL pass cheap → 60fps scroll.
  const uniforms = {
    uFisheye:    () => cfg.fisheye,
    uAberration: () => cfg.aberration,
    uGlitch:     () => cfg.glitch,
    uScan:       () => cfg.scan,
    uScanCount:  () => cfg.scanCount,
    uVignette:   () => cfg.vignette,
    uDither:     () => cfg.dither,
  }
  vfx = VFX.init({
    pixelRatio: 1,
    zIndex: 2,
    postEffect: { shader: CRT_SHADER, uniforms },
  })
  if (!vfx) return  // no WebGL → plain photos stay visible

  // Each sticker is added with a passthrough shader; the CRT post-effect then
  // processes the composited viewport (fand's approach). `release` keeps cells
  // rendering a moment after they leave the viewport so scroll stays seamless.
  const addOne = (img) => {
    const go = () => vfx && vfx.add(img, { shader: 'none', release: 600 })
      .catch(() => { img.style.opacity = '' })
    if (img.complete && img.naturalWidth) go()
    else img.addEventListener('load', go, { once: true })
  }
  imgs.forEach(addOne)

  // Live tuning handle: biakoStickers.set({ scan: 0.7, fisheye: 0.5 })
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
