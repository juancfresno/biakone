// Shared shell behaviour — initialised ONCE per session (the shell persists
// across barba transitions, so this must never double-bind). Exposes initShell()
// called by app.js on first load only.
// - real-time clock (footer)
// - theme toggle (◐) with localStorage persistence
// - nav link letter scramble (desktop hover)

let started = false

export function initShell () {
  if (started) return
  started = true

  // ─── Real-time clock — DAY.MON.DD — HH:MM (Figma footer).
  ;(function () {
    const el = document.getElementById('clock')
    if (!el) return
    const DAYS   = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
    const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
    const pad = (n) => String(n).padStart(2, '0')
    function tick () {
      const d = new Date()
      el.textContent =
        DAYS[d.getDay()] + '.' + MONTHS[d.getMonth()] + '.' + pad(d.getDate()) +
        ' — ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
    }
    tick()
    setInterval(tick, 15000)
  })()

  // ─── Theme toggle ◐ — instant swap, persisted in localStorage.
  ;(function () {
    const toggle = document.getElementById('theme-toggle')
    if (!toggle) return
    function applyTheme (theme) {
      if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark')
      else                  document.documentElement.removeAttribute('data-theme')
      try { localStorage.setItem('biako-theme', theme) } catch (e) {}
    }
    toggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
      applyTheme(current === 'dark' ? 'light' : 'dark')
    })
  })()

  // ─── Nav link letter scramble (desktop hover) ─────────────────────────────
  // Faithful port of the portfolio's useScramble (Nav.tsx): on hover the label
  // cycles random chars and resolves left→right over 420ms. The nav persists, so
  // binding once is correct.
  ;(function () {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
    const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%?'
    const DURATION = 420

    document.querySelectorAll('.nav-link > span').forEach((span) => {
      const text = span.textContent
      const link = span.closest('.nav-link')
      let raf = 0, t0 = 0

      function frame (ts) {
        if (!t0) t0 = ts
        const progress = Math.min((ts - t0) / DURATION, 1)
        const resolved = Math.floor(progress * text.length)
        span.textContent = text.split('').map((ch, i) => {
          if (ch === ' ') return ' '
          if (i < resolved) return ch
          return CHARS[Math.floor(Math.random() * CHARS.length)]
        }).join('')
        if (progress < 1) raf = requestAnimationFrame(frame)
        else { span.textContent = text; t0 = 0 }
      }

      link.addEventListener('mouseenter', () => { cancelAnimationFrame(raf); t0 = 0; raf = requestAnimationFrame(frame) })
      link.addEventListener('mouseleave', () => { cancelAnimationFrame(raf); t0 = 0; span.textContent = text })
    })
  })()
}
