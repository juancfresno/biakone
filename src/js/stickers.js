// Stickers — folder-driven full-bleed photo stack (/stickers.json) with an
// optional WebGL VHS/CRT + fisheye effect powered by VFX-JS (@vfx-js/core).
//
// Progressive enhancement: the markup is plain <img>. The effect is only
// layered on when WebGL is available AND the user hasn't asked for reduced
// motion. If anything fails, the untouched photos remain visible.
//
// Tuning: every knob lives in TUNE below and reaches the shader as a uniform
// FUNCTION (VFX-JS re-reads it each frame), so it's tunable live from the
// console with no rebuild:  biakoStickers.set({ rgb: 5, glitch: 1.4 })

import { VFX } from '@vfx-js/core'

// ─── Tunable parameters ───────────────────────────────────────────────────
const TUNE = {
  intensity: 1.0,   // master multiplier for every effect
  fisheye:   0.14,  // barrel / CRT bulge (0 = flat)
  rgb:       3.2,   // chromatic aberration, in source pixels
  scan:      0.20,  // scanline darkening strength
  scanCount: 240.0, // number of scanlines across a cell
  glitch:    1.0,   // horizontal tear / tracking-noise amount
  vignette:  0.35,  // corner darkening
}
// Mobile is lighter — softer effect + cheaper fragment → keeps 60fps scroll.
const MOBILE = { intensity: 0.55, fisheye: 0.10, rgb: 2.0, glitch: 0.45, vignette: 0.28 }

// ─── VHS / CRT + fisheye fragment shader (GLSL ES 3.00, VFX-JS convention) ──
const SHADER = /* glsl */ `
precision highp float;
uniform vec2 resolution;
uniform vec2 offset;
uniform float time;
uniform sampler2D src;
uniform float uIntensity, uFisheye, uRGB, uScan, uScanCount, uGlitch, uVignette;
out vec4 outColor;

float hash(float n){ return fract(sin(n) * 43758.5453123); }
float vnoise(float x){
  float i = floor(x), f = fract(x);
  return mix(hash(i), hash(i + 1.0), smoothstep(0.0, 1.0, f));
}
// The bulge pulls edges inward so we never read outside the image; clamping
// keeps glitch / aberration offsets from tearing transparent gaps.
vec4 samp(vec2 uv){ return texture(src, clamp(uv, 0.0, 1.0)); }

void main(){
  vec2 uv = (gl_FragCoord.xy - offset) / resolution;
  float I = uIntensity;

  // Fisheye / barrel bulge: magnify centre, compress edges (CRT glass).
  vec2 c = uv - 0.5;
  float r2 = dot(c, c);
  c *= 1.0 - (uFisheye * I) * r2;
  vec2 fuv = c + 0.5;

  // VHS horizontal wobble + intermittent tracking bursts.
  float t = time;
  float wob = (vnoise(fuv.y * 8.0 + t * 2.0) - 0.5) * 2.0;
  float burst = step(0.965, vnoise(floor(t * 3.0) + floor(fuv.y * 14.0)));
  fuv.x += wob * (uGlitch * 0.0035) * I
         + burst * (hash(floor(fuv.y * 30.0) + floor(t * 3.0)) - 0.5) * uGlitch * 0.06 * I;

  // RGB shift / chromatic aberration (stronger toward the edges).
  float ca = (uRGB / resolution.x) * I * (1.0 + 2.0 * burst) * (0.6 + 1.4 * abs(c.x));
  vec4 cr = samp(fuv + vec2(ca, 0.0));
  vec4 cg = samp(fuv);
  vec4 cb = samp(fuv - vec2(ca, 0.0));
  vec3 col = vec3(cr.r, cg.g, cb.b);
  float a = max(max(cr.a, cg.a), cb.a);

  // Scanlines.
  float sl = sin(fuv.y * uScanCount * 3.14159265);
  col *= 1.0 - (uScan * I) * (0.5 - 0.5 * sl);

  // Slow moving tracking band + subtle brightness flicker.
  col += smoothstep(0.06, 0.0, abs(fract(fuv.y - t * 0.15) - 0.5)) * 0.035 * I;
  col *= 1.0 + (vnoise(t * 12.0) - 0.5) * 0.04 * I;

  // Vignette.
  col *= mix(1.0, smoothstep(0.9, 0.15, r2 * 2.0), uVignette * I);

  outColor = vec4(col, a);
}
`

// ─── Render the folder-driven stack ────────────────────────────────────────
function cellHtml (item) {
  return (
    '<figure class="stickers__cell">' +
      '<img src="' + item.src + '" alt="" loading="lazy" decoding="async">' +
    '</figure>'
  )
}

// Per-mount VFX instance so we can tear it down on leave (WebGL / rAF cleanup).
let vfx = null

function initEffect (imgs) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduce || !imgs.length) return

  const isMobile = window.matchMedia('(max-width: 640px)').matches
  const cfg = { ...TUNE, ...(isMobile ? MOBILE : {}) }

  try {
    vfx = VFX.init({ pixelRatio: isMobile ? 1 : Math.min(window.devicePixelRatio || 1, 2), zIndex: 2 })
  } catch { vfx = null }
  if (!vfx) return  // no WebGL → plain photos stay visible

  // Uniform FUNCTIONS: VFX-JS calls them every frame, so mutating `cfg`
  // live (via biakoStickers.set) takes effect immediately.
  const uniforms = {
    uIntensity: () => cfg.intensity,
    uFisheye:   () => cfg.fisheye,
    uRGB:       () => cfg.rgb,
    uScan:      () => cfg.scan,
    uScanCount: () => cfg.scanCount,
    uGlitch:    () => cfg.glitch,
    uVignette:  () => cfg.vignette,
  }

  const addOne = (img) => {
    const go = () => vfx && vfx.add(img, {
      shader: SHADER,
      uniforms,
      release: 400,     // keep rendering briefly after leaving the viewport
    }).catch(() => { img.style.opacity = '' })  // restore the photo on failure
    if (img.complete && img.naturalWidth) go()
    else img.addEventListener('load', go, { once: true })
  }
  imgs.forEach(addOne)

  // Live tuning handle: biakoStickers.set({ glitch: 1.5, rgb: 6 })
  window.biakoStickers = {
    tune: cfg,
    set (patch) { Object.assign(cfg, patch) },
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
