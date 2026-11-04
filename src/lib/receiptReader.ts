import { api, compressImage } from './api'
import { guessScope } from '../screens/tabs/Items'
import type { K6Kind, Room, Scope } from '../types'

// Vad som står på ett kvitto, uppdelat i rader. Detta är formatet en AI Vision-tjänst ska lämna tillbaka.
export interface ScanLine {
  title: string
  price: number
  room_id: string | null
  scope: Scope
  match_id?: string | null   // ett planerat köp som raden troligen är
  k6Kind?: K6Kind | null     // föreslaget K6-avdrag
}
export interface ReceiptScan {
  store: string | null
  date: string | null
  total: number | null
  lines: ScanLine[]
  ignored: ScanLine[]     // godis, kassar och annat som inte hör till hemmet
  example: boolean        // exempeldata, inte läst från bilden
  note?: string           // visas i granskningen, t.ex. när AI-läsningen inte svarade
}

// Planerade köp som en rad på kvittot kan höra ihop med, t.ex. "Soffa, ca 7 000 kr".
export interface PlannedRef { id: string; title: string; price: number; room_id: string | null }
export interface ReadContext { rooms: Room[]; planned: PlannedRef[] }

// En läsare får bilden, hemmets rum och planerade köp och lämnar tillbaka raderna.
export type ReceiptReader = (file: File, ctx: ReadContext, onProgress?: (p: number) => void) => Promise<ReceiptScan>

const STORES = ['Bauhaus', 'IKEA', 'Clas Ohlson', 'Jula', 'Biltema', 'Hornbach', 'Byggmax', 'Beijer', 'K-Rauta', 'Colorama', 'Elgiganten', 'Mio', 'Jysk', 'Rusta', 'Granit', 'Åhléns', 'Hemtex', 'Mekonomen', 'Netonnet', 'Power']

// Saker som sällan hör till hemmet. De räknas bort men visas så att man kan ta med dem.
const IRRELEVANT = /(snickers|godis|choklad|tuggummi|läsk|dricka|coca|pepsi|energidryck|kasse|påse|bärkasse|pant|korv|glass|chips|kaka|bulle|kaffe to go|tidning)/i

// Rader som inte är varor: summor, moms och betalning.
const NOT_ITEM = /(summa|total|att betala|moms|kort|kontant|växel|betalt|rabatt|kvitto|org\.?nr|telefon|tel\b|datum|kassa|avrundning|bankkort|visa|mastercard|swish|netto|brutto|antal|kvittonr)/i

// Gissar rum från ordet, om hemmet har ett rum med det namnet.
const ROOM_WORDS: [RegExp, string[]][] = [
  [/(stekpanna|kastrull|kniv|skärbräda|diskborste|bestick|tallrik|glas\b|kökshandduk|kaffebryggare|vattenkokare|diskmaskin|kyl|frys|spis|ugn)/i, ['Kök']],
  [/(duschdraperi|duschhandtag|duschslang|tandborst|tandkräm|badrumsmatta|tvål|badhandduk|handduk|toalett|wc|handfat|spegel|rengöring|kalkborttag)/i, ['WC', 'Badrum']],
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

const num = (s: string) => parseFloat(s.replace(/[\s.](?=\d{3}\b)/g, '').replace(',', '.'))
const line = (title: string, price: number, rooms: Room[]): ScanLine => ({ title, price, room_id: guessRoom(title, rooms), scope: guessScope(title) })

// Läser kvittot med textigenkänning i webbläsaren. Fungerar bäst på ett rakt foto i bra ljus.
export const readWithOcr: ReceiptReader = async (file, { rooms }, onProgress) => {
  const empty: ReceiptScan = { store: null, date: null, total: null, lines: [], ignored: [], example: false }
  if (!file.type.startsWith('image/')) return empty
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
    ;(IRRELEVANT.test(title) ? scan.ignored : scan.lines).push(line(title, price, rooms))
  }
  return scan
}

const toDataUrl = (blob: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result as string)
    r.onerror = () => rej(r.error)
    r.readAsDataURL(blob)
  })

// Läser kvittot med AI Vision via Edge Function parse-receipt (OpenAI gpt-4o-mini). Nyckeln finns bara i Supabase.
export const readWithAi: ReceiptReader = async (file, { rooms, planned }, onProgress) => {
  onProgress?.(0.1)
  // Mindre bild går fortare att skicka och räcker för att läsa texten.
  const image = await toDataUrl(await compressImage(file, 1600))
  onProgress?.(0.3)
  const roomName = (id: string | null) => rooms.find((r) => r.id === id)?.name ?? null
  const res = await api.parseReceipt(image, rooms.map((r) => r.name), planned.map((p) => ({ id: p.id, title: p.title, price: p.price, room: roomName(p.room_id) })))
  if (!res) throw new Error('Ingen AI-läsning')
  onProgress?.(1)
  const roomId = (name: unknown) => {
    const n = String(name ?? '').toLowerCase()
    return n ? rooms.find((r) => r.name.toLowerCase() === n)?.id ?? rooms.find((r) => r.name.toLowerCase().startsWith(n))?.id ?? null : null
  }
  const price = (x: unknown) => (Number.isFinite(Number(x)) ? Math.round(Number(x) * 100) / 100 : 0)
  const date = typeof res.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(res.date) ? res.date : null
  // Bara kopplingar till planerade köp som finns, och varje köp högst en gång.
  const used = new Set<string>()
  const match = (id: unknown) => {
    const m = typeof id === 'string' && planned.some((p) => p.id === id) && !used.has(id) ? id : null
    if (m) used.add(m)
    return m
  }
  return {
    store: res.store || null,
    date,
    total: res.total == null ? null : price(res.total),
    lines: (res.lines ?? []).filter((l: any) => l?.title).map((l: any) => ({
      title: String(l.title), price: price(l.price), room_id: roomId(l.room) ?? guessRoom(String(l.title), rooms), scope: l.scope === 'build' ? 'build' : 'home',
      match_id: match(l.match),
      k6Kind: l.k6 === 'basic' || l.k6 === 'maintenance' ? l.k6 : null,
    })),
    ignored: (res.ignored ?? []).filter((l: any) => l?.title).map((l: any) => ({ title: String(l.title), price: price(l.price), room_id: null, scope: 'home' as Scope })),
    example: false,
  }
}

// Exempel på vad AI:n lämnar tillbaka, för demoläget och för att se hur granskningen fungerar.
export const exampleScan = (rooms: Room[]): ReceiptScan => ({
  store: 'Bauhaus',
  date: new Date().toISOString().slice(0, 10),
  total: 1319,
  lines: [{ ...line('Väggfärg Alcro Bestå 3 l', 649, rooms), k6Kind: 'maintenance' }, line('Stekpanna 28 cm', 399, rooms), line('Gardinstång 120 cm', 249, rooms)],
  ignored: [line('Snickers', 15, rooms), line('Bärkasse', 7, rooms)],
  example: true,
})

// Enkel koppling när AI:n inte är med: samma ord i namnen, med stöd av rum och pris.
const words = (s: string) => s.toLowerCase().split(/[^a-zåäö]+/).filter((w) => w.length >= 4)
export function matchPlanned(lines: ScanLine[], planned: PlannedRef[]): ScanLine[] {
  const used = new Set<string>()
  return lines.map((l) => {
    if (l.match_id !== undefined) return l
    const lw = words(l.title)
    let best: { id: string; score: number } | null = null
    for (const p of planned) {
      if (used.has(p.id)) continue
      const pw = words(p.title)
      const hits = pw.filter((w) => lw.some((x) => x.includes(w) || w.includes(x))).length
      if (!hits) continue
      const score = hits + (p.room_id && p.room_id === l.room_id ? 0.5 : 0) + (p.price && Math.abs(p.price - l.price) / p.price < 0.5 ? 0.5 : 0)
      if (!best || score > best.score) best = { id: p.id, score }
    }
    if (best) used.add(best.id)
    return { ...l, match_id: best?.id ?? null }
  })
}

// Den läsare appen använder: AI först. Svarar den inte läses texten på enheten i stället.
// I demoläget, där det inte finns någon AI, visas exemplet om inga rader hittas.
export const readReceipt: ReceiptReader = async (file, ctx, onProgress) => {
  let note: string | undefined
  if (!api.demo && file.type.startsWith('image/')) {
    try {
      const scan = await readWithAi(file, ctx, onProgress)
      return { ...scan, lines: matchPlanned(scan.lines, ctx.planned) }
    } catch (err) {
      console.warn('AI-läsningen misslyckades', err)
      note = 'AI-läsningen svarade inte, så kvittot lästes på telefonen. Kontrollera raderna.'
    }
  }
  const scan = await readWithOcr(file, ctx, onProgress).catch(() => null)
  const done = (s: ReceiptScan): ReceiptScan => ({ ...s, lines: matchPlanned(s.lines, ctx.planned), note })
  if (scan?.lines.length) return done(scan)
  if (api.demo) return done(exampleScan(ctx.rooms))
  return done(scan ?? { store: null, date: null, total: null, lines: [], ignored: [], example: false })
}
