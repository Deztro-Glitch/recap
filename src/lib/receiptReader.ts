import { api, compressImage } from './api'
import { guessScope } from './items'
import { guessCategory } from './budget'
import type { BudgetCategory, K6Kind, Room, Scope } from '../types'

// En rad på kvittot, sorterad av AI:n: rum, Projekt/Boende, kategori, K6 och om den är säker.
export interface ScanLine {
  title: string
  price: number
  room_id: string | null
  scope: Scope
  category: BudgetCategory
  match_id?: string | null   // ett planerat köp som raden troligen är
  k6Kind?: K6Kind | null     // föreslaget K6-avdrag
  durable?: boolean          // håller länge (vitvara, elektronik, möbel): får reklamationsrätt
  sure: boolean              // false: raden hamnar i Att granska
}
// En vitvara från ett foto eller en typskylt, med det vanliga underhållet för den.
export interface ScannedAppliance { name: string; model: string | null; room_id: string | null; care: { name: string; every_days: number }[] }
// Vad bilden är. "unknown" när varken AI:n eller textigenkänningen kunde avgöra det; då får man välja själv.
export type ImageKind = 'receipt' | 'room' | 'product' | 'appliance' | 'other' | 'unknown'
export interface ReceiptScan {
  kind: ImageKind
  room_id: string | null    // foto av ett rum eller en sak
  title: string | null      // sak man vill köpa
  price: number | null
  store: string | null
  date: string | null
  total: number | null
  lines: ScanLine[]
  appliance: ScannedAppliance | null
  ai: boolean               // läst av AI:n; annars textigenkänning på enheten och allt granskas
  example: boolean          // exempeldata i demoläget, inte läst från bilden
}

// Planerade köp som en rad på kvittot kan höra ihop med, t.ex. "Soffa, ca 7 000 kr".
export interface PlannedRef { id: string; title: string; price: number; room_id: string | null }
export interface ReadContext { rooms: Room[]; planned: PlannedRef[]; hint?: 'receipt' | null }

const empty: ReceiptScan = { kind: 'unknown', room_id: null, title: null, price: null, store: null, date: null, total: null, lines: [], appliance: null, ai: false, example: false }

const STORES = ['ICA Maxi', 'ICA Kvantum', 'ICA Supermarket', 'ICA Nära', 'ICA', 'Coop', 'Willys', 'Hemköp', 'Lidl', 'City Gross', 'Bauhaus', 'IKEA', 'Clas Ohlson', 'Jula', 'Biltema', 'Hornbach', 'Byggmax', 'Beijer', 'K-Rauta', 'Colorama', 'Elgiganten', 'Mio', 'Jysk', 'Rusta', 'Granit', 'Åhléns', 'Hemtex', 'Mekonomen', 'Netonnet', 'Power', 'Apotek', 'Circle K', 'OKQ8', 'Preem']

// Rader som inte är varor: summor, moms, pant, kassar och betalning.
const NOT_ITEM = /(summa|total|att betala|moms|kort|kontant|växel|betalt|rabatt|kvitto|org\.?nr|telefon|tel\b|datum|kassa|avrundning|bankkort|visa|mastercard|swish|netto|brutto|antal|kvittonr|pant|kasse|påse|bärkasse)/i

// Gissar rum från ordet, om hemmet har ett rum med det namnet.
const ROOM_WORDS: [RegExp, string[]][] = [
  [/(stekpanna|kastrull|kniv|skärbräda|diskborste|bestick|tallrik|glas\b|kökshandduk|kaffebryggare|vattenkokare|diskmaskin|kyl|frys|spis|ugn)/i, ['Kök']],
  [/(duschdraperi|duschhandtag|duschslang|tandborst|badrumsmatta|badhandduk|handduk|toalett|wc|handfat|spegel|kalkborttag)/i, ['WC', 'Badrum']],
  [/(gardin|soffa|soffbord|kudde|pläd|tv-|matta|fåtölj)/i, ['Vardagsrum']],
  [/(påslakan|lakan|täcke|säng|örngott|nattduksbord|garderob)/i, ['Sovrum']],
  [/(skohylla|krok|dörrmatta|hatthylla)/i, ['Hall']],
]
export function guessRoom(title: string, rooms: Room[]) {
  for (const [re, names] of ROOM_WORDS) {
    if (!re.test(title)) continue
    const room = rooms.find((r) => names.some((n) => r.name.toLowerCase().startsWith(n.toLowerCase())))
    if (room) return room.id
  }
  return null
}

// Varor som håller länge, när AI:n inte säger det själv (äldre funktion eller textigenkänning).
const DURABLE = /(diskmaskin|tvättmaskin|torktumlare|kyl|frys|spis|ugn|mikro|köksfläkt|dammsugare|kaffemaskin|vattenkokare|brödrost|tv\b|tv-|dator|laptop|skärm|mobil|telefon|surfplatta|högtalare|hörlurar|borrmaskin|skruvdragare|sticksåg|cirkelsåg|slipmaskin|soffa|säng|fåtölj|bord|stol|byrå|garderob|lampa|taklampa)/i
export const isDurable = (title: string) => DURABLE.test(title)

// Kategori från namnet, annars från butiken (allt från ICA är mat om inget annat syns).
const categoryFor = (title: string, store: string | null): BudgetCategory => {
  const c = guessCategory(title)
  return c === 'other' && store ? guessCategory(store) : c
}

const num = (s: string) => parseFloat(s.replace(/[\s.](?=\d{3}\b)/g, '').replace(',', '.'))
// En rad som lästs på enheten: allt är gissat, så den granskas alltid.
const localLine = (title: string, price: number, rooms: Room[], store: string | null): ScanLine => {
  const category = categoryFor(title, store)
  return { title, price, room_id: category === 'home' ? guessRoom(title, rooms) : null, scope: guessScope(title), category, durable: isDurable(title), sure: false }
}

// Läser kvittot med textigenkänning i webbläsaren. Fungerar bäst på ett rakt foto i bra ljus.
export const readWithOcr = async (file: File, { rooms, hint }: ReadContext, onProgress?: (p: number) => void): Promise<ReceiptScan> => {
  if (!file.type.startsWith('image/')) return { ...empty, kind: hint ?? 'unknown' }
  const { createWorker, PSM } = await import('tesseract.js')
  const worker = await createWorker('swe', 1, { logger: (m: { status: string; progress: number }) => m.status === 'recognizing text' && onProgress?.(m.progress) })
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_COLUMN })
  const { data } = await worker.recognize(file)
  await worker.terminate()

  const text = data.text
  const store = STORES.find((s) => text.toLowerCase().includes(s.toLowerCase())) ?? null
  const d = text.match(/(20\d{2})[-./](\d{2})[-./](\d{2})/) ?? text.match(/\b(\d{2})[-./](\d{2})[-./](20\d{2})\b/)
  const date = d ? (d[1].length === 4 ? `${d[1]}-${d[2]}-${d[3]}` : `${d[3]}-${d[2]}-${d[1]}`) : null

  const scan: ReceiptScan = { ...empty, store, date }
  for (const raw of text.split('\n')) {
    const m = raw.trim().match(/^(.*?[A-Za-zÅÄÖåäö].*?)\s+(-?\d{1,6}(?:[ .]\d{3})*[,.]\d{2})\s*[A-Z*]?$/)
    if (!m) continue
    const title = m[1].replace(/\s{2,}/g, ' ').trim()
    const price = num(m[2])
    if (/(summa|total|att betala)/i.test(title)) scan.total = price
    if (NOT_ITEM.test(title) || !Number.isFinite(price) || price <= 0) continue
    scan.lines.push(localLine(title, price, rooms, store))
  }
  // Hittas rader eller en summa är det ett kvitto. Annars vet vi inte, om man inte sa att det var ett kvitto.
  scan.kind = scan.lines.length || scan.total != null ? 'receipt' : hint ?? 'unknown'
  return scan
}

const toDataUrl = (blob: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result as string)
    r.onerror = () => rej(r.error)
    r.readAsDataURL(blob)
  })

const CATEGORIES: BudgetCategory[] = ['housing', 'loans', 'food', 'transport', 'home', 'fun', 'saving', 'other']

// Läser bilden med AI Vision via Edge Function parse-receipt (OpenAI gpt-4o-mini). Nyckeln finns bara i Supabase.
export const readWithAi = async (file: File, { rooms, planned, hint }: ReadContext, onProgress?: (p: number) => void): Promise<ReceiptScan> => {
  onProgress?.(0.1)
  // Mindre bild går fortare att skicka och räcker för att läsa texten.
  const image = await toDataUrl(await compressImage(file, 1600))
  onProgress?.(0.3)
  const roomName = (id: string | null) => rooms.find((r) => r.id === id)?.name ?? null
  const res = await api.parseReceipt(image, rooms.map((r) => r.name), planned.map((p) => ({ id: p.id, title: p.title, price: p.price, room: roomName(p.room_id) })), hint)
  if (!res) throw new Error('Ingen AI-läsning')
  onProgress?.(1)
  const roomId = (name: unknown) => {
    const n = String(name ?? '').toLowerCase()
    return n ? rooms.find((r) => r.name.toLowerCase() === n)?.id ?? rooms.find((r) => r.name.toLowerCase().startsWith(n))?.id ?? null : null
  }
  const price = (x: unknown) => (Number.isFinite(Number(x)) ? Math.round(Number(x) * 100) / 100 : 0)
  const date = typeof res.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(res.date) ? res.date : null
  const store = res.store ? String(res.store) : null
  // Bara kopplingar till planerade köp som finns, och varje köp högst en gång.
  const used = new Set<string>()
  const match = (id: unknown) => {
    const m = typeof id === 'string' && planned.some((p) => p.id === id) && !used.has(id) ? id : null
    if (m) used.add(m)
    return m
  }
  const lines: ScanLine[] = (res.lines ?? []).filter((l: any) => l?.title).map((l: any) => {
    const title = String(l.title)
    const category: BudgetCategory = CATEGORIES.includes(l.category) ? l.category : categoryFor(title, store)
    return {
      title, price: price(l.price), category,
      room_id: roomId(l.room) ?? (category === 'home' ? guessRoom(title, rooms) : null),
      scope: l.scope === 'build' ? 'build' : 'home',
      match_id: match(l.match),
      k6Kind: l.k6 === 'basic' || l.k6 === 'maintenance' ? l.k6 : null,
      durable: typeof l.durable === 'boolean' ? l.durable : isDurable(title),
      // En äldre version av funktionen säger inte om den är säker; då granskas raden.
      sure: l.sure === true && price(l.price) > 0,
    }
  })
  const total = res.total == null ? null : price(res.total)
  // En äldre version av funktionen läser bara kvitton och säger inte vad bilden är.
  const kind: ImageKind = ['receipt', 'room', 'product', 'appliance', 'other'].includes(res.kind) ? res.kind : lines.length || total != null ? 'receipt' : hint ?? 'unknown'
  return {
    kind, store, date, total, lines,
    room_id: roomId(res.room),
    title: res.title ? String(res.title) : null,
    price: res.price == null ? null : price(res.price),
    appliance: res.appliance && typeof res.appliance.name === 'string' ? {
      name: String(res.appliance.name), model: res.appliance.model ? String(res.appliance.model) : null, room_id: roomId(res.appliance.room),
      care: (Array.isArray(res.appliance.care) ? res.appliance.care : [])
        .filter((c: any) => c?.name && Number(c.every_days) > 0).slice(0, 4)
        .map((c: any) => ({ name: String(c.name), every_days: Math.round(Number(c.every_days)) })),
    } : null,
    ai: true, example: false,
  }
}

// Exempel på vad AI:n lämnar tillbaka, för demoläget. Gardinstången är AI:n osäker på, så den hamnar i Att granska.
export const exampleScan = (rooms: Room[]): ReceiptScan => {
  const room = (name: string) => rooms.find((r) => r.name.toLowerCase().startsWith(name))?.id ?? null
  return {
    ...empty, kind: 'receipt', store: 'Bauhaus', date: new Date().toISOString().slice(0, 10), ai: true, example: true, total: 1834,
    lines: [
      { title: 'Väggfärg Alcro Bestå 3 l', price: 649, room_id: null, scope: 'build', category: 'home', k6Kind: 'maintenance', sure: true },
      { title: 'Stekpanna 28 cm', price: 399, room_id: room('kök'), scope: 'home', category: 'home', sure: true },
      { title: 'Vattenkokare Wilfa 1,7 l', price: 499, room_id: room('kök'), scope: 'home', category: 'home', durable: true, sure: true },
      { title: 'Gardinstång 120 cm', price: 249, room_id: null, scope: 'home', category: 'home', sure: false },
      { title: 'Snickers', price: 15, room_id: null, scope: 'home', category: 'food', sure: true },
      { title: 'Kaffe bryggmalet', price: 23, room_id: null, scope: 'home', category: 'food', sure: true },
    ],
  }
}

// Enkel koppling när AI:n inte är med: samma ord i namnen, med stöd av rum och pris. Används bara som förslag i granskningen.
const words = (s: string) => s.toLowerCase().split(/[^a-zåäö]+/).filter((w) => w.length >= 4)
export function suggestPlanned(title: string, price: number, roomId: string | null, planned: PlannedRef[]): string | null {
  const lw = words(title)
  let best: { id: string; score: number } | null = null
  for (const p of planned) {
    const hits = words(p.title).filter((w) => lw.some((x) => x.includes(w) || w.includes(x))).length
    if (!hits) continue
    const score = hits + (p.room_id && p.room_id === roomId ? 0.5 : 0) + (p.price && Math.abs(p.price - price) / p.price < 0.5 ? 0.5 : 0)
    if (!best || score > best.score) best = { id: p.id, score }
  }
  return best?.id ?? null
}

// Den läsare appen använder: AI först. Svarar den inte läses texten på enheten i stället, och allt granskas.
// I demoläget, där det inte finns någon AI, kommer exemplet efter en kort stund.
export async function readReceipt(file: File, ctx: ReadContext, onProgress?: (p: number) => void): Promise<ReceiptScan> {
  if (api.demo) {
    await new Promise((r) => setTimeout(r, 1200))
    return exampleScan(ctx.rooms)
  }
  if (file.type.startsWith('image/')) {
    try {
      return await readWithAi(file, ctx, onProgress)
    } catch (err) {
      console.warn('AI-läsningen misslyckades', err)
    }
  }
  return (await readWithOcr(file, ctx, onProgress).catch(() => null)) ?? { ...empty, kind: ctx.hint ?? 'unknown' }
}
