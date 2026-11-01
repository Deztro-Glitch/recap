import { ROOM_PRESETS, type IconKey, type Palette } from '../types'

// Läser rumsnamnen i en planritning med textigenkänning (Tesseract, körs i webbläsaren
// utan kostnad). Ger namn och var texten står, som andelar 0–1 av bildens storlek.

export interface FoundRoom { name: string; icon: IconKey; color: Palette; x: number; y: number; box: { x0: number; y0: number; x1: number; y1: number } }

// Ord som brukar stå på planritningar, och vilket rum de betyder.
const WORDS: Record<string, string> = {
  sovrum: 'Sovrum', sov: 'Sovrum', vardagsrum: 'Vardagsrum', vardagsrumm: 'Vardagsrum', kok: 'Kök', hall: 'Hall', entre: 'Hall',
  matsal: 'Matsal', matplats: 'Matsal', wc: 'WC', dusch: 'WC', toalett: 'WC', badrum: 'Badrum', bad: 'Badrum', balkong: 'Balkong',
  altan: 'Balkong', terrass: 'Balkong', uterum: 'Uterum', kontor: 'Kontor', arbetsrum: 'Kontor', barnrum: 'Barnrum', allrum: 'Allrum',
  gastrum: 'Gästrum', forrad: 'Förråd', klk: 'Klädkammare', kladkammare: 'Klädkammare', tvatt: 'Tvättstuga', tvattstuga: 'Tvättstuga',
  groventre: 'Groventré', bastu: 'Bastu', garage: 'Garage', vind: 'Vind', kallare: 'Källare', sallskapsrum: 'Vardagsrum',
}
const EXTRA: Record<string, { icon: IconKey; color: Palette }> = {
  Uterum: { icon: 'plant', color: 'mint' }, Allrum: { icon: 'sofa', color: 'rose' }, Gästrum: { icon: 'bed', color: 'rose' },
  Klädkammare: { icon: 'box', color: 'steel' }, Groventré: { icon: 'door', color: 'steel' }, Bastu: { icon: 'droplet', color: 'coral' },
  Garage: { icon: 'box', color: 'steel' }, Vind: { icon: 'box', color: 'sand' }, Källare: { icon: 'stairs', color: 'steel' },
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '')

function distance(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}

// Tål små läsfel, t.ex. "Sovrurn" eller "Vardagsrurn".
function match(word: string): string | null {
  const w = norm(word)
  if (w.length < 2) return null
  if (WORDS[w]) return WORDS[w]
  if (w.startsWith('wc')) return 'WC'
  if (w.length < 4) return null
  let best: string | null = null
  let bestD = Infinity
  for (const [k, v] of Object.entries(WORDS)) {
    if (k.length < 4) continue
    const d = distance(w, k)
    const limit = k.length >= 8 ? 2 : 1
    if (d <= limit && d < bestD) [best, bestD] = [v, d]
  }
  return best
}

export const presetFor = (name: string) => {
  const base = name.replace(/ \d+$/, '')
  const p = ROOM_PRESETS.find((r) => r.name === base) ?? (EXTRA[base] ? { name: base, ...EXTRA[base] } : null)
  return { icon: p?.icon ?? ('home' as IconKey), color: p?.color ?? ('lilac' as Palette) }
}

// Väggar och linjer förvirrar textigenkänningen. Långa raka streck (vågräta och lodräta)
// sudds bort, och resten görs svartvitt, så att bara bokstäverna blir kvar.
function keepOnlyText(g: CanvasRenderingContext2D, W: number, H: number) {
  const img = g.getImageData(0, 0, W, H)
  const d = img.data
  const dark = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) dark[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2] < 170 ? 1 : 0
  const erase = new Uint8Array(W * H)
  const L = 45
  const mark = (x: number, y: number) => {
    for (let k = -2; k <= 2; k++) {
      if (y + k >= 0 && y + k < H) erase[(y + k) * W + x] = 1
      if (x + k >= 0 && x + k < W) erase[y * W + x + k] = 1
    }
  }
  for (let y = 0; y < H; y++) {
    let run = 0
    for (let x = 0; x <= W; x++) {
      if (x < W && dark[y * W + x]) run++
      else {
        if (run >= L) for (let k = x - run; k < x; k++) mark(k, y)
        run = 0
      }
    }
  }
  for (let x = 0; x < W; x++) {
    let run = 0
    for (let y = 0; y <= H; y++) {
      if (y < H && dark[y * W + x]) run++
      else {
        if (run >= L) for (let k = y - run; k < y; k++) mark(x, k)
        run = 0
      }
    }
  }
  for (let i = 0; i < W * H; i++) {
    const v = dark[i] && !erase[i] ? 0 : 255
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v
    d[i * 4 + 3] = 255
  }
  g.putImageData(img, 0, 0)
}

export async function readRoomNames(url: string, onProgress?: (p: number) => void): Promise<FoundRoom[]> {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = url
  await img.decode()

  // Alla bilder skalas till samma bredd så att texten får en läsbar storlek.
  const scale = 2000 / img.naturalWidth
  const c = document.createElement('canvas')
  c.width = Math.round(img.naturalWidth * scale)
  c.height = Math.round(img.naturalHeight * scale)
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.fillStyle = '#fff'
  g.fillRect(0, 0, c.width, c.height)
  g.drawImage(img, 0, 0, c.width, c.height)
  keepOnlyText(g, c.width, c.height)

  const { createWorker, PSM } = await import('tesseract.js')
  const worker = await createWorker('swe', 1, { logger: (m: { status: string; progress: number }) => m.status === 'recognizing text' && onProgress?.(m.progress) })
  // Glest utspridd text, som på en ritning.
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT })
  const { data } = await worker.recognize(c, {}, { blocks: true })
  await worker.terminate()

  const words = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words)))
  const found: FoundRoom[] = []
  for (const w of words) {
    if (w.confidence < 30) continue
    for (const part of w.text.split(/[/\-&+]/)) {
      const name = match(part)
      if (!name) continue
      const box = { x0: w.bbox.x0 / c.width, y0: w.bbox.y0 / c.height, x1: w.bbox.x1 / c.width, y1: w.bbox.y1 / c.height }
      const x = (box.x0 + box.x1) / 2
      const y = (box.y0 + box.y1) / 2
      // "WC/Dusch" på två rader blir ett rum.
      const near = found.find((f) => f.name === name && Math.hypot(f.x - x, f.y - y) < 0.08)
      if (near) {
        near.box = { x0: Math.min(near.box.x0, box.x0), y0: Math.min(near.box.y0, box.y0), x1: Math.max(near.box.x1, box.x1), y1: Math.max(near.box.y1, box.y1) }
        continue
      }
      found.push({ name, ...presetFor(name), x, y, box })
    }
  }
  // Flera rum med samma namn numreras: Sovrum, Sovrum 2.
  const seen = new Map<string, number>()
  for (const f of found) {
    const n = (seen.get(f.name) ?? 0) + 1
    seen.set(f.name, n)
    if (n > 1) f.name = `${f.name} ${n}`
  }
  return found
}
