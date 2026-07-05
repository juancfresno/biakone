// Stickers — folder-driven full-bleed photo stack (/stickers.json) rendered
// through a real CRT effect from VFX-JS (@vfx-js/core).
//
// The CRT shader is fand's (Yusuke Nakaya, the author of VFX-JS), taken verbatim
// from his MIT-licensed repo — github.com/fand/vfx-js,
// packages/examples/works/crt.html — and applied exactly the way he does there:
// as a VFX `postEffect` over the added elements. This is the library's real CRT,
// NOT a reimplementation. The only addition is a single `uIntensity` uniform so
// the effect can be softened for mobile / tuned live (mix toward passthrough).
//
// Progressive enhancement: the markup is plain <img>. The effect only layers on
// when WebGL is available AND reduced-motion is off; otherwise the untouched
// photos remain visible. Live tuning from the console:
//   biakoStickers.set(0.6)      // 0 = off … 1 = full fand … up to 2
//   biakoStickers.intensity

import { VFX } from '@vfx-js/core'

// ─── fand's CRT post-effect shader (MIT, github.com/fand/vfx-js) ────────────
// Verbatim from his crt.html, with a `uIntensity` knob mixed through the terms
// (uIntensity = 1 → exactly fand's look; 0 → passthrough).
const CRT_SHADER = /* glsl */ `
precision highp float;
uniform sampler2D src;
uniform vec2 offset;
uniform vec2 resolution;
uniform float time;
uniform float uIntensity;
out vec4 outColor;

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
  float I = clamp(uIntensity, 0.0, 2.0);

  vec2 p = uv * 2. - 1.;
  p.x *= resolution.x / resolution.y;
  float l = length(p);

  // barrel distort (curvature dialled by intensity: I=0 → flat, I=1 → fand)
  float dist = pow(l, 2.) * .3;
  dist = smoothstep(0., 1., dist);
  uv = zoom(uv, mix(1.0, 0.5 + dist, I));

  // radial blur
  float a = atan(p.y, p.x);
  float rd = rand(vec3(a, time, 0));
  uv = (uv - .5) * (1.0 + rd * pow(l * 0.7, 3.) * 0.3 * I) + .5;

  vec2 uvr = uv;
  vec2 uvg = uv;
  vec2 uvb = uv;

  // aberration
  float d = (1. + sin(uv.y * 20. + time * 3.) * 0.1) * 0.05 * I;
  uvr.x += 0.0015 * I;
  uvb.x -= 0.0015 * I;
  uvr = zoom(uvr, 1. + d * l * l);
  uvb = zoom(uvb, 1. - d * l * l);

  // glitch bands
  float gr = rand(vec2(floor(time * 43.), 1.));
  if (gr > 0.8) {
    float y = sin(floor(uv.y / 0.07)) + sin(floor(uv.y / 0.003 + time));
    float f = rand(vec2(y, floor(time * 5.0))) * 2. - 1.;
    uvr.x += f * 0.05 * I;
    uvg.x += f * 0.1 * I;
    uvb.x += f * 0.15 * I;
  }
  float gr2 = rand(vec2(floor(time * 37.), 10.));
  if (gr2 > 0.9) {
    uvr.x += sin(uv.y * 7. + time + 1.) * 0.015 * I;
    uvg.x += sin(uv.y * 5. + time + 2.) * 0.015 * I;
    uvb.x += sin(uv.y * 3. + time + 3.) * 0.015 * I;
  }

  vec4 cr = readTex(uvr);
  vec4 cg = readTex(uvg);
  vec4 cb = readTex(uvb);

  outColor = vec4(cr.r, cg.g, cb.b, (cr.a + cg.a + cb.a) / 1.);

  vec4 deco = vec4(0.);

  // scanline
  float res = resolution.y;
  deco += (
    sin(uv.y * res * .7 + time * 100.) *
    sin(uv.y * res * .3 - time * 130.)
  ) * 0.05;

  // grid
  deco += smoothstep(.01, .0, min(fract(uv.x * 20.), fract(uv.y * 20.))) * 0.1;

  outColor += deco * smoothstep(2., 0., l) * I;

  // vignette
  outColor *= mix(1.0, 1.8 - l * l, I);

  // dither
  outColor += rand(vec3(p, time)) * 0.1 * I;
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
let intensity = 1.0

function initEffect (imgs) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduce || !imgs.length) return

  const isMobile = window.matchMedia('(max-width: 640px)').matches
  // fand's shader at 1.0 is tuned for a full-screen immersive demo and buries our
  // photos in noise; ~0.26 keeps the real CRT character while the stickers stay
  // legible. Tune live with biakoStickers.set(v).
  intensity = isMobile ? 0.1 : 0.15   // mobile lighter

  // init like fand: a global CRT post-effect over everything we add.
  // pixelRatio 1 keeps the scanlines as discrete lines (not a sub-pixel rainbow
  // moiré) and keeps the single WebGL pass cheap → 60fps scroll.
  vfx = VFX.init({
    pixelRatio: 1,
    zIndex: 2,
    postEffect: { shader: CRT_SHADER, uniforms: { uIntensity: () => intensity } },
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

  // Live tuning handle: biakoStickers.set(0.6)
  window.biakoStickers = {
    get intensity () { return intensity },
    set (v) { intensity = Math.max(0, Math.min(2, Number(v) || 0)) },
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
