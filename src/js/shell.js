// Shared shell behavior — runs on every page.
// - real-time clock (footer)
// - theme toggle (◐) with localStorage persistence

// ─── Real-time clock — DAY.MON.DD — HH:MM (Figma footer).
(function () {
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
(function () {
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
