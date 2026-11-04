import type { Condition, Economy, Room } from '../types'

// Estimerat marknadsvärde från boarea, områdets kvadratmeterpriser och rummens skick.
// Köparen betalar för skicket, inte för kvittona, så K6-förbättringar läggs inte ovanpå.

// Kök och våtrum väger tyngst: 30 % vardera, övriga rum delar på resten.
const isKitchen = (r: Room) => /^kök/i.test(r.name)
const isWet = (r: Room) => /^(badrum|wc|toalett|dusch|tvätt)/i.test(r.name)

export function averageCondition(rooms: Room[]) {
  const c = (r: Room) => (r.condition ?? 2) as Condition
  const groups = [
    { weight: 0.3, rooms: rooms.filter(isKitchen) },
    { weight: 0.3, rooms: rooms.filter(isWet) },
    { weight: 0.4, rooms: rooms.filter((r) => !isKitchen(r) && !isWet(r)) },
  ].filter((g) => g.rooms.length)
  const total = groups.reduce((s, g) => s + g.weight, 0)
  if (!total) return 2
  return groups.reduce((s, g) => s + (g.weight / total) * (g.rooms.reduce((a, r) => a + c(r), 0) / g.rooms.length), 0)
}

export interface Valuation {
  value: number | null       // null när det saknas uppgifter
  condition: number          // viktat snittskick 1–3
  renovated: number          // rum i skick 3
  rooms: number
  area: number
  missing: string[]          // fält som behövs för att räkna
}

// Skick 1 ger inköpspriset, skick 2 boarea × snittpris och skick 3 boarea × toppris. Däremellan rakt emellan.
export function valuation(e: Economy | null | undefined, rooms: Room[]): Valuation {
  const condition = averageCondition(rooms)
  const base = { condition, renovated: rooms.filter((r) => r.condition === 3).length, rooms: rooms.length, area: e?.area ?? 0 }
  const missing = [
    !e?.purchasePrice && 'inköpspris',
    !e?.area && 'boarea',
    !e?.sqmAverage && 'snittpris per kvm',
    !e?.sqmTop && 'toppris per kvm',
  ].filter((x): x is string => !!x)
  if (missing.length) return { ...base, value: null, missing }
  const p1 = e!.purchasePrice!
  const p2 = e!.area! * e!.sqmAverage!
  const p3 = e!.area! * e!.sqmTop!
  const value = condition <= 2 ? p1 + (p2 - p1) * (condition - 1) : p2 + (p3 - p2) * (condition - 2)
  return { ...base, value: Math.round(value / 1000) * 1000, missing }
}
