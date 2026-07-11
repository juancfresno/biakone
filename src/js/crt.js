// Shared CRT / VHS post-effect — the single source of truth for the ambient
// scanline "screen" used across the site (Stickers, Posters, Lab).
//
// The shader is fand's (Yusuke Nakaya, author of VFX-JS) CRT from the MIT repo
// github.com/fand/vfx-js (packages/examples/works/crt.html), applied as a VFX
// `postEffect` exactly as he does — retuned for Biako (subtler glitch, moderate
// barrel, stronger scanlines). Every knob is a live-tunable uniform.
//
// Two decoupled tunings share ONE shader:
//   • IMAGE   — barrel/fisheye + aberration over photo sources (Stickers/Posters)
//   • AMBIENT — fisheye/aberration/glitch OFF: just the dark screen + full-width
//               scanlines, for a page-wide CRT backdrop (Lab). No image sources.

import { VFX } from '@vfx-js/core'

// ─── CRT post-effect shader — fand's (MIT, github.com/fand/vfx-js), retuned ──
export const CRT_SHADER = /* glsl */ `
precision highp float;
uniform sampler2D src;
uniform vec2 offset;
uniform vec2 resolution;
uniform float time;
uniform float uFisheye, uAberration, uGlitch, uScan, uScanCount, uVignette, uDither;
out vec4 outColor;

// Internal barrel ceiling — the bulge strength = uFisheye * BARREL_MAX.
const float BARREL_MAX = 1.6;

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

  // barrel / fisheye bulge (whole viewport) — CONVEX CRT tube.
  vec2 bc = uv - 0.5;
  bc.x *= resolution.x / resolution.y;
  float br2 = dot(bc, bc);
  uv = 0.5 + (uv - 0.5) * (1.0 + uFisheye * BARREL_MAX * br2);

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
  // scanlines read edge-to-edge, not only on the sources.
  float amb = 0.022 * smoothstep(1.85, 0.1, l) * (1.0 - uScan * scan);
  outColor.rgb += amb * (1.0 - outColor.a);
  outColor.a = max(outColor.a, amb * 2.2);

  // vignette / bloom
  outColor *= mix(1.0, 1.8 - l * l, uVignette);

  // dither
  outColor += rand(vec3(p, time)) * uDither;
}
`

// ─── Tunings ────────────────────────────────────────────────────────────────
// IMAGE — barrel + aberration over photo sources (Stickers / Posters).
export const CRT_IMAGE        = { fisheye: 0.55, aberration: 0.06, glitch: 0.05, scan: 0.5,  scanCount: 240.0, vignette: 0.22, dither: 0.05 }
export const CRT_IMAGE_MOBILE = { fisheye: 0.4,  aberration: 0.04, glitch: 0.03, scan: 0.38, scanCount: 150.0, vignette: 0.16, dither: 0.03 }

// AMBIENT — the DECOUPLED backdrop: no fisheye, no aberration, no glitch. Just a
// dark screen with full-width scanlines + a soft vignette (Lab). A touch stronger
// vignette so the flat screen still reads as a CRT face.
export const CRT_AMBIENT        = { fisheye: 0, aberration: 0, glitch: 0, scan: 0.5, scanCount: 240.0, vignette: 0.30, dither: 0.04 }
export const CRT_AMBIENT_MOBILE = { fisheye: 0, aberration: 0, glitch: 0, scan: 0.4, scanCount: 150.0, vignette: 0.22, dither: 0.03 }

// Create a CRT post-effect over the viewport. Returns a small handle, or null
// under reduced-motion / no-WebGL (callers then leave their sources untouched).
//   crt = createCRT({ zIndex })
//   crt.add(el)      → route an element's pixels through the effect
//   crt.destroy()    → tear down WebGL + rAF and remove the fixed canvas
// `cfg` is the live tuning object (mutate it to retune in real time).
export function createCRT ({ zIndex = 2, tune = CRT_IMAGE, mobileTune = CRT_IMAGE_MOBILE } = {}) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduce) return null

  const isMobile = window.matchMedia('(max-width: 640px)').matches
  const cfg = { ...tune, ...(isMobile ? mobileTune : {}) }

  const uniforms = {
    uFisheye:    () => cfg.fisheye,
    uAberration: () => cfg.aberration,
    uGlitch:     () => cfg.glitch,
    uScan:       () => cfg.scan,
    uScanCount:  () => cfg.scanCount,
    uVignette:   () => cfg.vignette,
    uDither:     () => cfg.dither,
  }
  // pixelRatio 1 keeps the scanlines as discrete lines (not a sub-pixel moiré)
  // and keeps the single WebGL pass cheap → 60fps.
  const vfx = VFX.init({ pixelRatio: 1, zIndex, postEffect: { shader: CRT_SHADER, uniforms } })
  if (!vfx) return null   // no WebGL → caller leaves plain content visible

  return {
    vfx,
    cfg,
    // `release` keeps a source rendering a moment after it leaves the viewport so
    // scroll stays seamless; shader 'none' = passthrough (the CRT is the postEffect).
    add (el) { return vfx.add(el, { shader: 'none', release: 600 }) },
    destroy () { try { vfx.destroy() } catch {} },
  }
}
