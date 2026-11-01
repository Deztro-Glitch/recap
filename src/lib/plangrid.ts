import type { PlanMap } from '../types'

// Planritningen delas in i ett rutnät. Mörka linjer i bilden blir väggar,
// och ett rum är de rutor man fyllt eller målat i med rummets nummer.

export const COLS = 180
export const WALL = 255 // vägg som användaren ritat själv

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

// Fyller rummet från rutan man tryckte på. Returnerar "leak" om färgen nådde bildens kant,
// vilket betyder att rummet inte är stängt (då görs ingenting).
export function fill(grid: Uint8Array, b: Barriers, start: number, value: number): 'ok' | 'leak' | 'none' {
  const { cols, rows, wall } = b
  // Trycker man precis på en linje: ta närmaste lediga ruta.
  if (wall[start] && grid[start] === 0) {
    const near = neighbors(start, cols, rows).flatMap((n) => [n, ...neighbors(n, cols, rows)]).find((n) => !wall[n] || grid[n])
    if (near === undefined) return 'none'
    start = near
  }
  const target = grid[start]
  if (target === value || target === WALL) return 'none'

  const region: number[] = []
  const seen = new Uint8Array(grid.length)
  const queue = [start]
  seen[start] = 1
  let touchesEdge = false
  const open = (i: number) => (target === 0 ? grid[i] === 0 && !wall[i] : grid[i] === target)
  while (queue.length) {
    const i = queue.pop()!
    region.push(i)
    const x = i % cols
    if (target === 0 && (x === 0 || x === cols - 1 || i < cols || i >= cols * (rows - 1))) touchesEdge = true
    for (const n of neighbors(i, cols, rows)) {
      if (!seen[n] && open(n)) {
        seen[n] = 1
        queue.push(n)
      }
    }
  }
  if (touchesEdge) return 'leak'
  for (const i of region) grid[i] = value

  absorbIslands(grid, cols, rows, region, value)
  return 'ok'
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
        const x = i % cols
        if (x === 0 || x === cols - 1 || i < cols || i >= cols * (rows - 1) || island.length > MAX) ok = false
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

// Rummet vid en punkt, med lite marginal om man träffar en linje eller text.
export function roomAt(grid: Uint8Array, cols: number, rows: number, cell: number): number {
  if (grid[cell] && grid[cell] !== WALL) return grid[cell]
  const cx = cell % cols
  const cy = Math.floor(cell / cols)
  const count = new Map<number, number>()
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx
      const y = cy + dy
      if (x < 0 || y < 0 || x >= cols || y >= rows) continue
      const v = grid[y * cols + x]
      if (v && v !== WALL) count.set(v, (count.get(v) ?? 0) + 1)
    }
  }
  let best = 0
  let bestN = 0
  for (const [v, n] of count) if (n > bestN) [best, bestN] = [v, n]
  return best
}

// Målar en linje mellan två rutor med en viss pensel.
export function paint(grid: Uint8Array, cols: number, rows: number, from: number, to: number, value: number, radius: number) {
  const [x0, y0, x1, y1] = [from % cols, Math.floor(from / cols), to % cols, Math.floor(to / cols)]
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1)
  for (let s = 0; s <= steps; s++) {
    const cx = Math.round(x0 + ((x1 - x0) * s) / steps)
    const cy = Math.round(y0 + ((y1 - y0) * s) / steps)
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > radius * radius + radius) continue
        const x = cx + dx
        const y = cy + dy
        if (x >= 0 && y >= 0 && x < cols && y < rows) grid[y * cols + x] = value
      }
    }
  }
}

export function encode(grid: Uint8Array, cols: number, rows: number, ids: string[]): PlanMap {
  const data: number[] = []
  let i = 0
  while (i < grid.length) {
    const v = grid[i]
    let n = 1
    while (i + n < grid.length && grid[i + n] === v) n++
    data.push(v, n)
    i += n
  }
  return { cols, rows, ids, data }
}

export function decode(map: PlanMap | null, cols: number, rows: number): { grid: Uint8Array; ids: string[] } {
  const grid = new Uint8Array(cols * rows)
  if (!map || map.cols !== cols || map.rows !== rows) return { grid, ids: [] }
  let i = 0
  for (let k = 0; k < map.data.length; k += 2) {
    grid.fill(map.data[k], i, i + map.data[k + 1])
    i += map.data[k + 1]
  }
  return { grid, ids: [...map.ids] }
}

// En punkt inne i varje rum att sätta namnet på.
export function labelPoints(grid: Uint8Array, cols: number): Map<number, { x: number; y: number }> {
  const sum = new Map<number, { x: number; y: number; n: number }>()
  for (let i = 0; i < grid.length; i++) {
    const v = grid[i]
    if (!v || v === WALL) continue
    const s = sum.get(v) ?? { x: 0, y: 0, n: 0 }
    s.x += i % cols
    s.y += Math.floor(i / cols)
    s.n++
    sum.set(v, s)
  }
  const out = new Map<number, { x: number; y: number }>()
  for (const [v, s] of sum) {
    const mx = s.x / s.n
    const my = s.y / s.n
    let p = { x: mx, y: my }
    // L-formade rum: flytta till närmaste ruta som faktiskt hör till rummet.
    if (grid[Math.round(my) * cols + Math.round(mx)] !== v) {
      let best = Infinity
      for (let i = 0; i < grid.length; i++) {
        if (grid[i] !== v) continue
        const d = (i % cols - mx) ** 2 + (Math.floor(i / cols) - my) ** 2
        if (d < best) {
          best = d
          p = { x: i % cols, y: Math.floor(i / cols) }
        }
      }
    }
    out.set(v, p)
  }
  return out
}
