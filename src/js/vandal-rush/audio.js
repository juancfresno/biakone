// Vandal Rush — tiny synthesized SFX (Web Audio). No audio assets: every sound
// is a short oscillator blip so it ships with zero payload. Mobile autoplay needs
// a user gesture, so the AudioContext is created/resumed on the first tap (unlock,
// called from PLAY). Mute is persisted. Fully torn down on destroy().

export function createAudio () {
  let ctx = null
  let muted = false
  try { muted = localStorage.getItem('vr:muted') === '1' } catch {}

  function unlock () {                       // call from a user gesture (PLAY / tap)
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext
      if (AC) { try { ctx = new AC() } catch { ctx = null } }
    }
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {})
  }

  // one oscillator with a quick decay envelope (optionally pitch-sliding)
  function blip (freq, dur, type, gain, slideTo) {
    if (muted || !ctx || ctx.state !== 'running') return
    const t = ctx.currentTime
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = type || 'square'
    o.frequency.setValueAtTime(freq, t)
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t + dur)
    g.gain.setValueAtTime(gain || 0.18, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(ctx.destination)
    o.start(t); o.stop(t + dur + 0.02)
  }
  function seq (steps) {                      // steps: [ [freq,dur,type,gain,slide], ...] timed by dur
    let at = 0
    for (const s of steps) { const [f, d, ty, g, sl] = s; const delay = at; setTimeout(() => blip(f, d, ty, g, sl), delay * 1000); at += d }
  }

  const sfx = {
    jump:   () => blip(300, 0.11, 'square', 0.16, 640),
    tag:    () => blip(200, 0.14, 'sawtooth', 0.15, 90),
    pickup: () => seq([[660, 0.07, 'square', 0.15], [990, 0.09, 'square', 0.15]]),
    buff:   () => blip(150, 0.18, 'sawtooth', 0.13, 70),
    caught: () => blip(220, 0.28, 'square', 0.2, 90),
    bust:   () => seq([[170, 0.16, 'square', 0.2, 80], [110, 0.3, 'square', 0.2, 55]]),
  }

  return {
    unlock,
    sfx,
    get muted () { return muted },
    toggleMute () {
      muted = !muted
      try { localStorage.setItem('vr:muted', muted ? '1' : '0') } catch {}
      return muted
    },
    destroy () { if (ctx) { try { ctx.close() } catch {} ctx = null } },
  }
}
