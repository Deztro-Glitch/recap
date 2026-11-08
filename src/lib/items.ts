import { api } from './api'
import { needsInfo, paid, type ProjectState } from './useProject'
import { type BudgetCategory, type Detail, type K6Kind, type Purchase, type Receipt, type Scope, type Task } from '../types'

// Inköpsmodellen: inköp och jobb som en sak (Item), hur de läses från databasen, sorteras, summeras och bockas av.
// Används av skärmarna, komponenterna och hjälpfunktionerna; själva listorna och formulären finns i screens/tabs/Items.tsx.

export const today = () => new Date().toISOString().slice(0, 10)
export const fmtDate = (d: string) => new Date(d).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })

// Tar bort en rad direkt (används när man sveper bort den).
export async function removeRow(state: ProjectState, table: 'purchases' | 'tasks' | 'contracts', id: string, title: string, toast?: (t: string) => void) {
  await api.remove(table, id)
  // Var det sista raden på ett kvitto tas kvittot (och bilden) bort också.
  const receiptId = table === 'purchases' ? state.purchases.find((p) => p.id === id)?.receipt_id : null
  if (receiptId && !state.purchases.some((p) => p.id !== id && p.receipt_id === receiptId)) await api.remove('receipts', receiptId)
  await state.reload()
  toast?.(`${title} är borttagen`)
}

// Inköp och jobb är samma sak för den som använder appen: något som är planerat eller klart.
// Nya saker sparas som inköp. Jobb finns kvar i sin egen tabell från tiden innan.
export type ItemTable = 'purchases' | 'tasks'
export interface Item {
  table: ItemTable
  id: string
  title: string
  room_id: string | null
  done: boolean
  amount: number          // betalt när det är klart, annars ungefär vad det kostar
  date: string | null
  important: boolean
  file: string | null     // kvitto
  image: string | null    // bild på det man vill ha
  store: string | null
  link: string | null
  stays: boolean          // följer med lägenheten
  k6: boolean             // värdehöjande förbättring
  k6Kind: K6Kind | null   // grundförbättring eller underhåll (5-årsregeln)
  scope: Scope            // bygget eller inredningen
  category: BudgetCategory | null   // budgetkategori, när AI:n har valt en
  receipt_id: string | null         // raden hör till ett kvitto med flera rader
  details: Detail[] | null
  missing: boolean        // fotat kvitto utan belopp
  planned: number | null  // vad det var planerat att kosta, när det är klart
  created_at: string
  raw: Purchase | Task
}

// receiptFile är bilden på kvittot när raden hör till ett kvitto med flera rader.
export const fromPurchase = (p: Purchase, receiptFile?: string | null): Item => ({
  table: 'purchases', id: p.id, title: p.title, room_id: p.room_id, done: p.bought,
  amount: p.bought ? paid(p) : Number(p.est_price) || 0, date: p.bought ? p.bought_on : null, important: p.priority === 1,
  file: p.receipt_path ?? receiptFile ?? null, image: p.image_path ?? null, store: p.store, link: p.link, stays: !!p.stays, k6: !!p.k6, k6Kind: p.k6_kind ?? null, scope: p.scope ?? guessScope(p.title), category: p.category ?? null, receipt_id: p.receipt_id ?? null, details: p.details,
  missing: needsInfo(p), planned: p.bought && p.price != null && Number(p.est_price) > 0 ? Number(p.est_price) : null, created_at: p.created_at, raw: p,
})

export const fromTask = (t: Task): Item => ({
  table: 'tasks', id: t.id, title: t.title, room_id: t.room_id, done: t.status === 'done',
  amount: Number(t.cost) || 0, date: t.status === 'done' ? t.done_on : null, important: t.priority === 1,
  file: t.receipt_path, image: null, store: null, link: null, stays: false, k6: !!t.k6, k6Kind: t.k6_kind ?? null, scope: 'build', category: null, receipt_id: null, details: t.details, missing: false, planned: null, created_at: t.created_at, raw: t,
})

export const allItems = (state: Pick<ProjectState, 'purchases' | 'tasks'> & { receipts?: Receipt[] }) => {
  const files = new Map((state.receipts ?? []).map((r) => [r.id, r.file_path]))
  return [...state.purchases.map((p) => fromPurchase(p, p.receipt_id ? files.get(p.receipt_id) : null)), ...state.tasks.map(fromTask)]
}

// Renoveringen: köp och jobb som hör till bygget (scope build). Används av Aktivt projekt och projektbudgeten.
export const renovationItems = (state: Pick<ProjectState, 'purchases' | 'tasks'>) => allItems(state).filter((i) => i.scope === 'build')

// Gissar om något är bygge eller inredning när man inte har valt själv.
const BUILD = /(riv|spackl|slip|grundm|måla|målning|stryk|kakel|klinker|fog|golvlist|golvläggning|lägga golv|parkett|laminat|tätskikt|golvbrunn|gips|regel|reglar|elarbete|elektriker|dra el|vvs|rör|avlopp|ventilation|tapet|puts|isoler|snick|stomm|bänkskiva|köksrenov|bygg|färg|spik|skruv|cement|fästmassa)/i
export const guessScope = (title: string): Scope => (BUILD.test(title) ? 'build' : 'home')

// Allt man kan söka på för en sak.
export const itemText = (it: Item, roomName?: string) =>
  [it.title, roomName, it.store, (it.raw as Purchase).note, ...(it.details ?? []).flatMap((d) => [d.label, d.value])].filter(Boolean).join(' ').toLowerCase()

// Viktigt först, sedan i den ordning de lades till.
export const byImportance = (a: Item, b: Item) => Number(b.important) - Number(a.important) || a.created_at.localeCompare(b.created_at)
export const byDate = (a: Item, b: Item) => (b.date ?? '').localeCompare(a.date ?? '') || b.created_at.localeCompare(a.created_at)
export const sum = (items: Item[]) => items.reduce((s, i) => s + i.amount, 0)

export function setDone(state: ProjectState, it: Item, on: boolean) {
  if (it.table === 'tasks') {
    const t = it.raw as Task
    return state.patch('tasks', it.id, { status: on ? 'done' : 'todo', done_on: on ? t.done_on ?? today() : t.done_on })
  }
  const p = it.raw as Purchase
  return state.patch('purchases', it.id, { bought: on, price: on ? p.price ?? p.est_price : p.price, bought_on: on ? p.bought_on ?? today() : p.bought_on })
}

// Detaljer som färgkod och mått från allt i rummet, utan dubbletter.
export function roomFacts(items: Item[]): Detail[] {
  const seen = new Set<string>()
  return items.flatMap((i) => i.details ?? []).filter((d) => {
    const k = `${d.label}|${d.value}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}
