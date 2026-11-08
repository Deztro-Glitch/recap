import type { Maintenance, Purchase } from '../types'
import type { ProjectState } from './useProject'

// Underhåll och garantier (steg 4). Bara det man själv har lagt in eller det som står på kvittona.

const DAY = 86_400_000
const today = () => new Date(new Date().toISOString().slice(0, 10)).getTime()
export const daysBetween = (from: string, to = today()) => Math.round((to - new Date(from).getTime()) / DAY)

// En sak att sköta: hur stor del av intervallet som har gått (0 = nyss gjort, 1 = dags) och hur många dagar som är kvar.
// Har det aldrig gjorts är det dags nu.
export interface CareItem { id: string; name: string; appliance: string | null; room_id: string | null; every: number; share: number; left: number; raw: Maintenance }
export function careItems(state: Pick<ProjectState, 'maintenance'>): CareItem[] {
  return state.maintenance.map((m) => {
    const ago = m.last_done ? Math.max(0, daysBetween(m.last_done)) : m.every_days
    return { id: m.id, name: m.name, appliance: m.appliance, room_id: m.room_id, every: m.every_days, share: ago / m.every_days, left: m.every_days - ago, raw: m }
  }).sort((a, b) => b.share - a.share)
}
// Det som snart är dags (minst 80 % av intervallet har gått), det mest bråttom först.
export const careDue = (items: CareItem[]) => items.filter((c) => c.share >= 0.8)

// Garantier: köp med garanti eller reklamationsrätt som inte har gått ut, den som går ut först överst.
export interface Warranty { id: string; title: string; until: string; left: number; room_id: string | null; raw: Purchase }
export function warranties(state: Pick<ProjectState, 'purchases'>): Warranty[] {
  return state.purchases
    .filter((p) => p.warranty_until && daysBetween(p.warranty_until) <= 0)
    .map((p) => ({ id: p.id, title: p.title, until: p.warranty_until!, left: -daysBetween(p.warranty_until!), room_id: p.room_id, raw: p }))
    .sort((a, b) => a.until.localeCompare(b.until))
}
// Garantier som går ut inom två månader syns på Idag.
export const warrantySoon = (list: Warranty[]) => list.filter((w) => w.left <= 60)

// Reklamationsrätten i Sverige: tre år från köpet för varor (konsumentköplagen). Används när AI:n
// säger att en kvittorad är en vara som håller länge (vitvara, elektronik, möbel, verktyg).
export const RECLAIM_YEARS = 3
export const reclaimUntil = (bought: string) => {
  const d = new Date(`${bought}T12:00:00`)
  d.setFullYear(d.getFullYear() + RECLAIM_YEARS)
  return d.toISOString().slice(0, 10)
}

const days = (n: number) => `${n} ${n === 1 ? 'dag' : 'dagar'}`
export const whenText = (left: number) => (left < 0 ? `${days(-left)} sen` : left === 0 ? 'Dags i dag' : `Om ${days(left)}`)
export const untilText = (w: Pick<Warranty, 'left' | 'until'>) =>
  w.left <= 0 ? 'Går ut i dag' : w.left < 60 ? `Går ut om ${days(w.left)}` : `Till ${new Date(`${w.until}T12:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })}`

// Förslag när man lägger till underhåll: vanliga sysslor med ett rimligt intervall. Man väljer själv.
export const CARE_SUGGESTIONS: { name: string; every: number }[] = [
  { name: 'Byta filter i köksfläkten', every: 90 },
  { name: 'Rengöra diskmaskinen', every: 30 },
  { name: 'Rengöra tvättmaskinen', every: 60 },
  { name: 'Frosta av frysen', every: 180 },
  { name: 'Rensa golvbrunnen', every: 90 },
  { name: 'Testa brandvarnaren', every: 90 },
  { name: 'Byta batteri i brandvarnaren', every: 365 },
  { name: 'Rengöra ventilationsdonen', every: 180 },
]
