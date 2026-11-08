import { fromV1 } from '../../lib/plangrid'
import type { PlanMap, Pt } from '../../types'

// Rummen på ritningen: rummets id → hörnen, i bråkdelar (0–1) av bildens bredd och höjd.
export type Polys = Record<string, Pt[]>

// Bredden i SVG:ns koordinater; höjden (H) följer bildens proportioner.
export const W = 1000

export const toPolys = (m: PlanMap | null): Polys => (!m ? {} : 'v' in m ? { ...m.rooms } : fromV1(m))

export const dec = (n: number, d = 1) => n.toLocaleString('sv-SE', { minimumFractionDigits: d, maximumFractionDigits: d })

// Ytan av ett rum i SVG-enheter. Skalan till kvm kommer från boarean (se FloorPlan).
export const polyArea = (p: Pt[], H: number) =>
  Math.abs(p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a.x * W * b.y * H - b.x * W * a.y * H }, 0)) / 2

// Rummens färger som riktiga färgvärden, så att framer-motion kan tona mellan dem när rum slås ihop.
const paints = new Map<string, string>()
export const paint = (c: string) => {
  if (!paints.has(c)) paints.set(c, getComputedStyle(document.documentElement).getPropertyValue(`--c-${c}-bg`).trim() || '#A2C7F0')
  return paints.get(c)!
}
