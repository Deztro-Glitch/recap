import type { Mode } from '../types'

// Läget (Projekt eller Boende) styr accenten och ljuset bakom glaset. Färgerna finns i theme.css under [data-mode].
export function applyMode(mode: Mode | null) {
  const root = document.documentElement
  const next = mode === 'simple' ? 'home' : mode ? 'project' : ''
  if ((root.dataset.mode ?? '') === next) return
  // Mjuk övergång bara när man byter, så att vanliga hover-effekter inte blir tröga.
  if (root.dataset.mode !== undefined) {
    root.classList.add('is-switching')
    setTimeout(() => root.classList.remove('is-switching'), 450)
  }
  if (next) root.dataset.mode = next
  else delete root.dataset.mode
  // Senaste läget minns till nästa start, så att ljuset inte blinkar i fel färg (se index.html).
  try {
    if (next) localStorage.setItem('recap-mode', next)
  } catch {}
  syncThemeColor()
}

// Statusfältet på iPhone följer appens botten.
export function syncThemeColor() {
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
  if (bg) document.querySelector('meta[name=theme-color]')?.setAttribute('content', bg)
}
