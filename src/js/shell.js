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

  // ─── Custom cursor — RGB-glitch arrow ─────────────────────────────────────
  // Faithful port of the portfolio's Cursor.tsx
  // (src/components/ui/Cursor/Cursor.tsx): a full-screen fixed canvas with four
  // arrow channels (R/G/B chromatic split + a main ink), each lerping to the
  // pointer at a different speed → separation in motion, and a jitter that ramps
  // up while idle. Desktop / fine-pointer only. The shell persists for the whole
  // session, so this mounts once and runs for the lifetime of the page.
  ;(function () {
    if (!window.matchMedia('(pointer: fine)').matches) return

    // Resolve token colours to concrete rgb() strings (canvas can't read var()).
    const cssColor = (ref) => {
      const p = document.createElement('span')
      p.style.cssText = 'color:' + ref + ';display:none'
      document.body.appendChild(p)
      const c = getComputedStyle(p).color
      p.remove()
      return c
    }
    const COL_R = cssColor('var(--cursor-glitch-r)')
    const COL_G = cssColor('var(--cursor-glitch-g)')
    const COL_B = cssColor('var(--cursor-glitch-b)')
    const COL_W = cssColor('var(--cursor-main)')

    const canvas = document.createElement('canvas')
    canvas.className = 'biako-cursor'
    canvas.setAttribute('aria-hidden', 'true')
    document.body.appendChild(canvas)
    const ctx = canvas.getContext('2d')

    // Arrow shape — stroked, tip at (0,0). Exact geometry from the source.
    const drawArrow = (x, y, col, alpha) => {
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.strokeStyle = col
      ctx.lineWidth = 1.2
      ctx.translate(x, y)
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(0, 16)
      ctx.lineTo(3.5, 11.5)
      ctx.lineTo(7, 18)
      ctx.lineTo(9, 17)
      ctx.lineTo(5.5, 10.5)
      ctx.lineTo(11, 10.5)
      ctx.closePath()
      ctx.stroke()
      ctx.restore()
    }

    const resize = () => { canvas.width = innerWidth; canvas.height = innerHeight }
    resize()
    window.addEventListener('resize', resize)

    let mx = innerWidth / 2, my = innerHeight / 2
    let lx = mx, ly = my
    let idle = 0, ig = 0                     // ig = glitch intensity (0→1)
    let rx = mx, ry = my                     // red   — slowest (most lag)
    let gx = mx, gy = my                     // green
    let bx = mx, by = my                     // blue
    let wx = mx, wy = my                     // white — main cursor

    document.addEventListener('mousemove', (e) => { mx = e.clientX; my = e.clientY }, { passive: true })

    // Suppress the glitch cursor wherever a page already draws its OWN custom
    // cursor (About wordmark strip, drawer DRAG chip) so they never double up.
    const suppressed = () => !!document.querySelector('.about-cursor.is-visible, .drawer__cursor.is-visible')

    const loop = () => {
      const moved = Math.abs(mx - lx) > 0.1 || Math.abs(my - ly) > 0.1
      moved ? (idle = 0) : idle++
      lx = mx; ly = my

      ig += ((idle > 40 ? 1 : 0) - ig) * 0.04
      const jx = ig * (Math.random() - 0.5) * 3
      const jy = ig * (Math.random() - 0.5) * 3

      rx += (mx - rx) * 0.55; ry += (my - ry) * 0.55
      gx += (mx - gx) * 0.72; gy += (my - gy) * 0.72
      bx += (mx - bx) * 0.88; by += (my - by) * 0.88
      wx += (mx - wx) * 0.68; wy += (my - wy) * 0.68

      ctx.clearRect(0, 0, canvas.width, canvas.height)
      if (!suppressed()) {
        drawArrow(rx + jx * 1.5 + ig * (Math.random() - 0.5) * 2, ry + jy * 1.5 + ig * (Math.random() - 0.5) * 2, COL_R, 0.55 + ig * 0.3)
        drawArrow(gx + jx * 0.5, gy + jy * 0.5, COL_G, 0.3 + ig * 0.2)
        drawArrow(bx - jx * 1.2 + ig * (Math.random() - 0.5) * 2, by - jy * 1.2 + ig * (Math.random() - 0.5) * 2, COL_B, 0.6 + ig * 0.3)
        drawArrow(wx + (Math.random() - 0.5) * ig * 2, wy + (Math.random() - 0.5) * ig * 2, COL_W, 0.5 + ig * 0.2)
      }
      requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
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
