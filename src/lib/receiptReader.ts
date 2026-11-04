import { api } from './api'
import { guessScope } from '../screens/tabs/Items'
import type { Room, Scope } from '../types'

// Vad som står på ett kvitto, uppdelat i rader. Detta är formatet en AI Vision-tjänst ska lämna tillbaka.
export interface ScanLine { title: string; price: number; room_id: string | null; scope: Scope }
export interface ReceiptScan {
  store: string | null
  date: string | null
  total: number | null
  lines: ScanLine[]
  ignored: ScanLine[]     // godis, kassar och annat som inte hör till hemmet
  example: boolean        // exempeldata, inte läst från bilden
}

// Byt ut den här mot ett anrop till AI Vision när den finns. Den får bilden och hemmets rum.
export type ReceiptReader = (file: File, rooms: Room[], onProgress?: (p: number) => void) => Promise<ReceiptScan>

const STORES = ['Bauhaus', 'IKEA', 'Clas Ohlson', 'Jula', 'Biltema', 'Hornbach', 'Byggmax', 'Beijer', 'K-Rauta', 'Colorama', 'Elgiganten', 'Mio', 'Jysk', 'Rusta', 'Granit', 'Åhléns', 'Hemtex', 'Mekonomen', 'Netonnet', 'Power']

// Saker som sällan hör till hemmet. De räknas bort men visas så att man kan ta med dem.
const IRRELEVANT = /(snickers|godis|choklad|tuggummi|läsk|dricka|coca|pepsi|energidryck|kasse|påse|bärkasse|pant|korv|glass|chips|kaka|bulle|kaffe to go|tidning)/i

// Rader som inte är varor: summor, moms och betalning.
const NOT_ITEM = /(summa|total|att betala|moms|kort|kontant|växel|betalt|rabatt|kvitto|org\.?nr|telefon|tel\b|datum|kassa|avrundning|bankkort|visa|mastercard|swish|netto|brutto|antal|kvittonr)/i

// Gissar rum från ordet, om hemmet har ett rum med det namnet.
const ROOM_WORDS: [RegExp, string[]][] = [
  [/(stekpanna|kastrull|kniv|skärbräda|diskborste|bestick|tallrik|glas\b|kökshandduk|kaffebryggare|vattenkokare|diskmaskin|kyl|frys|spis|ugn)/i, ['Kök']],
  [/(duschdraperi|tandborst|badrumsmatta|tvål|badhandduk|toalett|wc-|handfat)/i, ['Badrum', 'WC']],
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
export const readWithOcr: ReceiptReader = async (file, rooms, onProgress) => {
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

// Exempel på vad AI:n lämnar tillbaka, för demoläget och för att se hur granskningen fungerar.
export const exampleScan = (rooms: Room[]): ReceiptScan => ({
  store: 'Bauhaus',
  date: new Date().toISOString().slice(0, 10),
  total: 1319,
  lines: [line('Väggfärg Alcro Bestå 3 l', 649, rooms), line('Stekpanna 28 cm', 399, rooms), line('Gardinstång 120 cm', 249, rooms)],
  ignored: [line('Snickers', 15, rooms), line('Bärkasse', 7, rooms)],
  example: true,
})

// Den läsare appen använder. Hittar den inga rader i demoläget visas exemplet.
export const readReceipt: ReceiptReader = async (file, rooms, onProgress) => {
  const scan = await readWithOcr(file, rooms, onProgress).catch(() => null)
  if (scan?.lines.length) return scan
  if (api.demo) return exampleScan(rooms)
  return scan ?? { store: null, date: null, total: null, lines: [], ignored: [], example: false }
}
