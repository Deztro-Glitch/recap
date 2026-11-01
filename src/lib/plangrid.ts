import type { PlanMapV1, Pt } from '../types'

// Planritningen läses som ett rutnät där mörka linjer är väggar. Rummen fylls ut från
// där namnen står, och varje ifylld yta görs sedan om till en form med hörn (andelar 0–1
// av bilden) som man kan dra i.

export const COLS = 180

export interface Barriers { cols: number; rows: number; wall: Uint8Array }

// Läser bilden och markerar rutor som innehåller linjer.
export async function loadBarriers(url: string, cols = COLS): Promise<Barriers> {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = url
  await img.decode()
  const rows = Math.max(1, Math.round((cols * img.naturalHeight) / img.naturalWidth))

  // Läs bilden i (nästan) full upplösning så att tunna linjer finns kvar. Väldigt stora bilder
  // halveras i steg, där varje steg bara slår ihop två pixlar.
  let src: CanvasImageSource = img
  let w = img.naturalWidth
  let h = img.naturalHeight
  while (w > 2400) {
    const step = document.createElement('canvas')
    step.width = Math.round(w / 2)
    step.height = Math.round(h / 2)
    const g = step.getContext('2d')!
    g.fillStyle = '#fff'
    g.fillRect(0, 0, step.width, step.height)
    g.drawImage(src, 0, 0, step.width, step.height)
    src = step
    w = step.width
    h = step.height
  }

  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.fillStyle = '#fff'
  g.fillRect(0, 0, w, h)
  g.drawImage(src, 0, 0, w, h)
  const px = g.getImageData(0, 0, w, h).data

  // En ruta är vägg om den innehåller någon mörk pixel.
  const wall = new Uint8Array(cols * rows)
  for (let py = 0; py < h; py++) {
    const y = Math.min(rows - 1, Math.floor((py * rows) / h))
    for (let pxl = 0; pxl < w; pxl++) {
      const i = (py * w + pxl) * 4
      const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
      if (lum < 190) wall[y * cols + Math.min(cols - 1, Math.floor((pxl * cols) / w))] = 1
    }
  }
  return { cols, rows, wall }
}

const neighbors = (i: number, cols: number, rows: number) => {
  const x = i % cols
  const out: number[] = []
  if (x > 0) out.push(i - 1)
  if (x < cols - 1) out.push(i + 1)
  if (i >= cols) out.push(i - cols)
  if (i < cols * (rows - 1)) out.push(i + cols)
  return out
}
const onEdge = (i: number, cols: number, rows: number) => {
  const x = i % cols
  return x === 0 || x === cols - 1 || i < cols || i >= cols * (rows - 1)
}

type Box = { x0: number; y0: number; x1: number; y1: number }

// Fyller alla rum på en gång från var sitt startställe (där namnet står). Där rum hänger ihop
// utan vägg delas ytan där fronterna möts. Utsidan växer från bildens kant samtidigt, så att
// ett rum med en öppning mot trapphuset inte tar över hela bilden.
// Returnerar rutnätet (rummets nummer per ruta) och de stängda ytor som ingen fick, t.ex. en
// balkong utan namn.
export function growRooms(b: Barriers, seeds: { cell: number; value: number }[], textBoxes: Box[]) {
  const { cols, rows } = b
  const wall = b.wall.slice()
  for (const r of textBoxes) {
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) if (x >= 0 && y >= 0 && x < cols && y < rows) wall[y * cols + x] = 0
  }

  const OUTSIDE = 254
  const owner = new Uint8Array(cols * rows)
  let queue: number[] = []
  const open = (i: number) => !wall[i] && !owner[i]
  for (const s of seeds) {
    if (!open(s.cell)) continue
    owner[s.cell] = s.value
    queue.push(s.cell)
  }
  for (let i = 0; i < owner.length; i++) {
    if (onEdge(i, cols, rows) && open(i)) {
      owner[i] = OUTSIDE
      queue.push(i)
    }
  }
  // Bredden först, en våg i taget, så att alla växer lika fort.
  while (queue.length) {
    const next: number[] = []
    for (const i of queue) {
      for (const n of neighbors(i, cols, rows)) {
        if (open(n)) {
          owner[n] = owner[i]
          next.push(n)
        }
      }
    }
    queue = next
  }

  const grid = new Uint8Array(cols * rows)
  const regions = new Map<number, number[]>()
  for (let i = 0; i < grid.length; i++) {
    const v = owner[i]
    if (!v || v === OUTSIDE) continue
    grid[i] = v
    let r = regions.get(v)
    if (!r) regions.set(v, (r = []))
    r.push(i)
  }
  for (const [v, region] of regions) absorbIslands(grid, cols, rows, region, v)

  // Stängda ytor som ingen nådde: tänkbara rum utan namn.
  const unnamed: number[][] = []
  const seen = new Uint8Array(grid.length)
  for (let i = 0; i < grid.length; i++) {
    if (seen[i] || wall[i] || owner[i]) continue
    const comp: number[] = []
    const q = [i]
    seen[i] = 1
    while (q.length) {
      const c = q.pop()!
      comp.push(c)
      for (const n of neighbors(c, cols, rows)) if (!seen[n] && !wall[n] && !owner[n]) (seen[n] = 1), q.push(n)
    }
    // Tjocka väggar ritas som två linjer med ett tomrum emellan. Sådana ytor är långa och
    // smala, så bara ytor som är någorlunda breda åt båda hållen räknas som rum.
    if (comp.length < grid.length * 0.01) continue
    const xs = comp.map((c) => c % cols)
    const ys = comp.map((c) => Math.floor(c / cols))
    const w = Math.max(...xs) - Math.min(...xs) + 1
    const h = Math.max(...ys) - Math.min(...ys) + 1
    if (Math.min(w, h) >= 8 && comp.length / (w * h) >= 0.35) unnamed.push(comp)
  }
  return { grid, unnamed }
}

// Text och möbelsymboler inne i rummet blir små öar av ofyllda rutor. Öar som bara
// gränsar mot rummet tas med. Riktiga väggar hänger ihop med resten av huset och är för stora.
function absorbIslands(grid: Uint8Array, cols: number, rows: number, region: number[], value: number) {
  const MAX = 250
  const seen = new Uint8Array(grid.length)
  for (const r of region) {
    for (const start of neighbors(r, cols, rows)) {
      if (grid[start] !== 0 || seen[start]) continue
      const island: number[] = []
      const queue = [start]
      seen[start] = 1
      let ok = true
      while (queue.length) {
        const i = queue.pop()!
        island.push(i)
        if (onEdge(i, cols, rows) || island.length > MAX) ok = false
        if (!ok) break
        for (const n of neighbors(i, cols, rows)) {
          if (grid[n] === 0 && !seen[n]) {
            seen[n] = 1
            queue.push(n)
          } else if (grid[n] !== 0 && grid[n] !== value) ok = false
        }
      }
      if (ok) for (const i of island) grid[i] = value
    }
  }
}

// ---------- Från rutor till form ----------

// Följer kanten runt de rutor som har ett visst värde och förenklar den till ett fåtal hörn.
export function polygonize(grid: Uint8Array, cols: number, rows: number, value: number): Pt[] | null {
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < cols && y < rows && grid[y * cols + x] === value
  // Riktade kanter med rummet till höger, så att de går att kedja ihop till slingor.
  const next = new Map<number, number[]>()
  const key = (x: number, y: number) => y * (cols + 1) + x
  const add = (ax: number, ay: number, bx: number, by: number) => {
    const k = key(ax, ay)
    const l = next.get(k)
    if (l) l.push(key(bx, by))
    else next.set(k, [key(bx, by)])
  }
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!inside(x, y)) continue
      if (!inside(x, y - 1)) add(x, y, x + 1, y)
      if (!inside(x + 1, y)) add(x + 1, y, x + 1, y + 1)
      if (!inside(x, y + 1)) add(x + 1, y + 1, x, y + 1)
      if (!inside(x - 1, y)) add(x, y + 1, x, y)
    }
  }
  let best: Pt[] = []
  let bestArea = 0
  while (next.size) {
    const [start] = next.keys()
    const loop: Pt[] = []
    let k = start
    for (let guard = 0; guard < 100000; guard++) {
      const l = next.get(k)
      if (!l) break
      const to = l.pop()!
      if (!l.length) next.delete(k)
      loop.push({ x: k % (cols + 1), y: Math.floor(k / (cols + 1)) })
      k = to
      if (k === start) break
    }
    const a = Math.abs(area(loop))
    if (a > bestArea) [best, bestArea] = [loop, a]
  }
  if (best.length < 3) return null
  const simple = dropShortEdges(orthogonalize(simplify(best, 2.2)), 3)
  if (simple.length < 3) return null
  return simple.map((p) => ({ x: p.x / cols, y: p.y / rows }))
}

// Douglas–Peucker på en sluten form.
function simplify(pts: Pt[], eps: number): Pt[] {
  const dp = (a: number, b: number, out: Pt[]) => {
    let far = -1
    let farD = 0
    const A = pts[a]
    const B = pts[b % pts.length]
    const len = Math.hypot(B.x - A.x, B.y - A.y) || 1
    for (let i = a + 1; i < b; i++) {
      const P = pts[i]
      const d = Math.abs((B.x - A.x) * (A.y - P.y) - (A.x - P.x) * (B.y - A.y)) / len
      if (d > farD) [far, farD] = [i, d]
    }
    if (farD > eps) {
      dp(a, far, out)
      dp(far, b, out)
    } else out.push(A)
  }
  // Dela formen vid punkten längst från starten och förenkla båda halvorna.
  let far = 0
  let farD = 0
  pts.forEach((p, i) => {
    const d = Math.hypot(p.x - pts[0].x, p.y - pts[0].y)
    if (d > farD) [far, farD] = [i, d]
  })
  const out: Pt[] = []
  dp(0, far, out)
  dp(far, pts.length, out)
  return out
}

// Kanter som nästan är vågräta eller lodräta görs helt raka, som väggar brukar vara.
function orthogonalize(pts: Pt[]): Pt[] {
  const p = pts.map((q) => ({ ...q }))
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < p.length; i++) {
      const a = p[i]
      const b = p[(i + 1) % p.length]
      const dx = Math.abs(b.x - a.x)
      const dy = Math.abs(b.y - a.y)
      if (dy < dx * 0.25) a.y = b.y = (a.y + b.y) / 2
      else if (dx < dy * 0.25) a.x = b.x = (a.x + b.x) / 2
    }
  }
  // Ta bort hörn som ligger på en rak linje.
  return p.filter((q, i) => {
    const a = p[(i - 1 + p.length) % p.length]
    const b = p[(i + 1) % p.length]
    return Math.abs((q.x - a.x) * (b.y - a.y) - (q.y - a.y) * (b.x - a.x)) > 1e-6
  })
}

// Små hack i formen (t.ex. vid en dörröppning) blir många hörn tätt ihop. Hörn närmare
// varandra än min rutor slås ihop, så att det blir färre och tydligare hörn att dra i.
function dropShortEdges(pts: Pt[], min: number): Pt[] {
  let p = pts
  for (let pass = 0; pass < 4 && p.length > 4; pass++) {
    const out: Pt[] = []
    for (const q of p) {
      const last = out[out.length - 1]
      if (last && Math.hypot(q.x - last.x, q.y - last.y) < min) {
        last.x = (last.x + q.x) / 2
        last.y = (last.y + q.y) / 2
      } else out.push({ ...q })
    }
    if (out.length > 3 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) < min) out.pop()
    // Spetsar (t.ex. där färgen läckt in i en dörröppning): skarpa hörn som bara pekar ut en bit.
    const kept = out.filter((q, i) => {
      if (out.length <= 4) return true
      const a = out[(i - 1 + out.length) % out.length]
      const b = out[(i + 1) % out.length]
      const v1 = { x: a.x - q.x, y: a.y - q.y }
      const v2 = { x: b.x - q.x, y: b.y - q.y }
      const cos = (v1.x * v2.x + v1.y * v2.y) / ((Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y)) || 1)
      return !(cos > 0.8 && Math.min(Math.hypot(v1.x, v1.y), Math.hypot(v2.x, v2.y)) < min * 4)
    })
    if (kept.length === p.length) break
    p = orthogonalize(kept)
  }
  return p
}

// ---------- Former ----------

export const area = (p: Pt[]) => p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a.x * b.y - b.x * a.y }, 0) / 2

export function inside(p: Pt[], q: Pt) {
  let c = false
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    if (p[i].y > q.y !== p[j].y > q.y && q.x < ((p[j].x - p[i].x) * (q.y - p[i].y)) / (p[j].y - p[i].y) + p[i].x) c = !c
  }
  return c
}

// En punkt inne i formen att sätta namnet på (mitten om den ligger inne, annars närmaste punkt inne).
export function labelPoint(p: Pt[]): Pt {
  const a = area(p)
  let cx = 0
  let cy = 0
  p.forEach((q, i) => {
    const r = p[(i + 1) % p.length]
    const f = q.x * r.y - r.x * q.y
    cx += (q.x + r.x) * f
    cy += (q.y + r.y) * f
  })
  const c = a ? { x: cx / (6 * a), y: cy / (6 * a) } : p[0]
  if (inside(p, c)) return c
  const xs = p.map((q) => q.x)
  const ys = p.map((q) => q.y)
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  let best = p[0]
  let bestD = Infinity
  for (let i = 1; i < 16; i++) {
    for (let j = 1; j < 16; j++) {
      const q = { x: x0 + ((x1 - x0) * i) / 16, y: y0 + ((y1 - y0) * j) / 16 }
      const d = (q.x - c.x) ** 2 + (q.y - c.y) ** 2
      if (d < bestD && inside(p, q)) [best, bestD] = [q, d]
    }
  }
  return best
}

// Äldre sparade ritningar var rutnät. De görs om till former när de laddas.
export function fromV1(map: PlanMapV1): Record<string, Pt[]> {
  const grid = new Uint8Array(map.cols * map.rows)
  let i = 0
  for (let k = 0; k < map.data.length; k += 2) {
    grid.fill(map.data[k], i, i + map.data[k + 1])
    i += map.data[k + 1]
  }
  const out: Record<string, Pt[]> = {}
  map.ids.forEach((id, k) => {
    const poly = polygonize(grid, map.cols, map.rows, k + 1)
    if (poly) out[id] = poly
  })
  return out
}
