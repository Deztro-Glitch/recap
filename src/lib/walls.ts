import type { Pt } from '../types'

// Väggar mellan rum på planritningen. Rummen är polygoner som ligger innanför väggarna, så en vägg mellan
// två rum syns som två parallella kanter med väggens tjocklek emellan. Här hittas de paren, och väggens
// mittlinje räknas ut, så att den kan klickas på, rivas (tonas bort i bilden) och rummen slås ihop.

export interface SharedWall {
  id: string                 // "rumA|rumB|n", rummen i bokstavsordning
  rooms: [string, string]
  a: Pt                      // mittlinjens ändar, i SVG-koordinater (inte 0–1)
  b: Pt
  gap: number                // avståndet mellan rummens kanter, dvs. väggens tjocklek på ritningen
  quad: Pt[]                 // ytan mellan kanterna, som fylls när väggen rivs
}

const MAX_GAP = 45     // tjockare än så är det inte en gemensam vägg (i SVG-enheter, bredden är 1000)
const MIN_OVERLAP = 18 // kortare gemensam bit än så räknas inte
const PARALLEL = 0.06  // hur sneda kanterna får vara mot varandra

export function sharedWalls(polys: [string, Pt[]][], W: number, H: number): SharedWall[] {
  const edges = polys.flatMap(([id, p]) =>
    p.map((q, i) => {
      const r = p[(i + 1) % p.length]
      return { id, a: { x: q.x * W, y: q.y * H }, b: { x: r.x * W, y: r.y * H } }
    }),
  )
  const found: SharedWall[] = []
  const count = new Map<string, number>()

  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const e = edges[i], f = edges[j]
      if (e.id === f.id) continue
      const L = Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y)
      const M = Math.hypot(f.b.x - f.a.x, f.b.y - f.a.y)
      if (L < MIN_OVERLAP || M < MIN_OVERLAP) continue
      const u = { x: (e.b.x - e.a.x) / L, y: (e.b.y - e.a.y) / L }
      const v = { x: (f.b.x - f.a.x) / M, y: (f.b.y - f.a.y) / M }
      if (Math.abs(u.x * v.y - u.y * v.x) > PARALLEL) continue
      // Avstånd (med tecken) från e:s linje till f, längs normalen n = (-u.y, u.x).
      const d = u.x * (f.a.y - e.a.y) - u.y * (f.a.x - e.a.x)
      if (Math.abs(d) > MAX_GAP || Math.abs(d) < 0.5) continue
      // Hur mycket kanterna överlappar längs e.
      const s1 = (f.a.x - e.a.x) * u.x + (f.a.y - e.a.y) * u.y
      const s2 = (f.b.x - e.a.x) * u.x + (f.b.y - e.a.y) * u.y
      const lo = Math.max(0, Math.min(s1, s2))
      const hi = Math.min(L, Math.max(s1, s2))
      if (hi - lo < MIN_OVERLAP) continue

      const n = { x: -u.y, y: u.x }
      const at = (s: number, off: number) => ({ x: e.a.x + u.x * s + n.x * off, y: e.a.y + u.y * s + n.y * off })
      const rooms = [e.id, f.id].sort() as [string, string]
      const pair = rooms.join('|')
      const k = count.get(pair) ?? 0
      count.set(pair, k + 1)
      found.push({
        id: `${pair}|${k}`,
        rooms,
        a: at(lo, d / 2),
        b: at(hi, d / 2),
        gap: Math.abs(d),
        quad: [at(lo, 0), at(hi, 0), at(hi, d), at(lo, d)],
      })
    }
  }
  return found
}

// Rum som hänger ihop genom rivna väggar blir en grupp. Varje rum pekar på hela sin grupp.
export function mergeGroups(roomIds: string[], walls: SharedWall[], gone: string[]): Map<string, string[]> {
  const parent = new Map(roomIds.map((id) => [id, id]))
  const find = (x: string): string => (parent.get(x) === x ? x : find(parent.get(x)!))
  for (const w of walls) {
    if (!gone.includes(w.id)) continue
    const [a, b] = w.rooms.map(find)
    if (a !== b) parent.set(a, b)
  }
  const groups = new Map<string, string[]>()
  for (const id of roomIds) {
    const root = find(id)
    groups.set(root, [...(groups.get(root) ?? []), id])
  }
  return new Map(roomIds.map((id) => [id, groups.get(find(id))!]))
}
