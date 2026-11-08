import { api } from './api'
import { readReceipt } from './receiptReader'
import { guessScope, today } from './items'
import type { Purchase, Receipt } from '../types'
import type { ProjectState } from './useProject'

// Vad som blev av en bild, för meddelandet efteråt.
export type FileResult =
  | { kind: 'receipt'; store: string | null; saved: number; review: number; closed: string[] }
  | { kind: 'photo'; room: string | null }
  | { kind: 'planned'; item: Purchase }
  | { kind: 'unknown' }

// Sorterar en bild utan att fråga: AI:n avgör om det är ett kvitto, ett foto av ett rum eller något man vill köpa,
// och sparar det på rätt ställe, var i appen man än står.
// Kvittorader AI:n är säker på sparas som klara köp (och stänger ett planerat köp om det är samma sak).
// Rader den är osäker på sparas också, men märks needs_review och visas i Att granska.
// hint "receipt": man valde Skanna kvitto. "unknown" betyder att man får välja själv vad bilden är.
export async function fileImage(state: ProjectState, file: File, hint: 'receipt' | null = null): Promise<FileResult> {
  const pid = state.project!.id
  const open = state.purchases.filter((p) => !p.bought)
  const planned = open.map((p) => ({ id: p.id, title: p.title, price: Number(p.est_price) || 0, room_id: p.room_id }))
  const scan = await readReceipt(file, { rooms: state.rooms, planned, hint })

  if (scan.kind === 'room') {
    // Första bilden på ett rum blir Före, sedan blir de Efter, så att jämförelsen i rummet fungerar av sig själv.
    const first = !state.photos.some((p) => p.room_id === scan.room_id)
    await api.uploadPhoto(pid, file, scan.room_id, first ? 'before' : 'after')
    return { kind: 'photo', room: state.rooms.find((r) => r.id === scan.room_id)?.name ?? null }
  }

  if (scan.kind === 'product') {
    const title = scan.title?.trim() || 'Nytt köp'
    const image_path = await api.uploadFile(pid, file)
    const item = await api.insert<Purchase>('purchases', {
      project_id: pid, room_id: scan.room_id, title, image_path, est_price: scan.price ?? 0, price: null, bought: false,
      bought_on: null, receipt_path: null, priority: 2, stays: false, k6: false, scope: guessScope(title), store: null, link: null, note: null, details: null,
    })
    return { kind: 'planned', item }
  }

  if (scan.kind !== 'receipt') return { kind: 'unknown' }

  const file_path = await api.uploadFile(pid, file)
  const date = scan.date ?? today()
  const lines = scan.lines
  const total = scan.total ?? lines.reduce((s, l) => s + l.price, 0)
  const receipt = await api.insert<Receipt>('receipts', { project_id: pid, file_path, store: scan.store, bought_on: date, total })
  const base = { project_id: pid, receipt_id: receipt.id, bought: true, bought_on: date, store: scan.store, receipt_path: null, image_path: null, priority: 2, stays: false, link: null, note: null, details: null }

  // Gick inga rader att läsa blir kvittot en rad med summan, att granska.
  if (!lines.length) {
    await api.insert<Purchase>('purchases', { ...base, title: scan.store ? `Kvitto ${scan.store}` : 'Kvitto', price: total, est_price: 0, room_id: null, scope: 'home', category: null, k6: false, k6_kind: null, needs_review: true })
    return { kind: 'receipt', store: scan.store, saved: 1, review: 1, closed: [] }
  }

  let review = 0
  const closed: string[] = []
  for (const l of lines) {
    const unsure = !scan.ai || !l.sure
    if (unsure) review++
    const fields = {
      title: l.title, price: l.price, room_id: l.room_id, scope: l.scope, category: l.category,
      k6: !!l.k6Kind, k6_kind: l.k6Kind ?? null, needs_review: unsure,
    }
    const plan = !unsure && l.match_id ? open.find((p) => p.id === l.match_id) : undefined
    if (plan) {
      // Raden är det planerade köpet: det blir klart i stället för att en ny rad skapas.
      const { project_id: _pid, ...keep } = base
      await api.update('purchases', plan.id, { ...keep, ...fields, room_id: l.room_id ?? plan.room_id })
      closed.push(plan.title)
      continue
    }
    await api.insert<Purchase>('purchases', { ...base, ...fields, est_price: 0 })
  }
  return { kind: 'receipt', store: scan.store, saved: lines.length, review, closed }
}
