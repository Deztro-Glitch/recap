import { api } from '../../lib/api'
import { growRooms, loadBarriers, polygonize, type Barriers } from '../../lib/plangrid'
import { presetFor, readRoomNames } from '../../lib/readplan'
import type { Room } from '../../types'
import type { Polys } from './geometry'

// Läser rummen ur ritningen: rumsnamnen med textigenkänning, väggarna ur bilden, och fyller ut varje rum från
// sitt namn tills det når en vägg. Rum som inte finns i hemmet skapas. Ger tillbaka rummens former och namnen.
export async function detectRooms(src: string, rooms: Room[], projectId: string, onProgress: (p: number) => void): Promise<{ polys: Polys; names: string[] }> {
  const [b, found] = await Promise.all([loadBarriers(src), readRoomNames(src, onProgress)])
  const list = [...rooms]
  const ensure = async (name: string) => {
    let r = list.find((x) => x.name.toLowerCase() === name.toLowerCase())
    if (!r) {
      r = await api.insert<Room>('rooms', { project_id: projectId, name, ...presetFor(name), sort: list.length })
      list.push(r)
    }
    return r
  }
  const named: Room[] = []
  const seeds = []
  const boxes = []
  for (const f of found) {
    const r = await ensure(f.name)
    named.push(r)
    const cx = Math.min(b.cols - 1, Math.floor(f.x * b.cols))
    const cy = Math.min(b.rows - 1, Math.floor(f.y * b.rows))
    seeds.push({ cell: cy * b.cols + cx, value: named.length })
    boxes.push({ x0: Math.floor(f.box.x0 * b.cols) - 1, y0: Math.floor(f.box.y0 * b.rows) - 1, x1: Math.ceil(f.box.x1 * b.cols) + 1, y1: Math.ceil(f.box.y1 * b.rows) + 1 })
  }
  const { grid, unnamed } = growRooms(b, seeds, boxes)
  const polys: Polys = {}
  named.forEach((r, k) => {
    const p = polygonize(grid, b.cols, b.rows, k + 1)
    if (p) polys[r.id] = p
  })
  // Stängda ytor utan namn: det som sticker ut från bostaden är troligen en balkong.
  const extra = await guessUnnamed(b, grid, unnamed, ensure, polys)
  return { polys, names: [...named.map((r) => r.name), ...extra] }
}

// Ytor som är stängda men saknar namn. Sticker ytan ut utanför de namngivna rummen är det
// troligen en balkong; annars blir den "Rum" som man kan döpa om.
async function guessUnnamed(b: Barriers, grid: Uint8Array, unnamed: number[][], ensure: (name: string) => Promise<Room>, out: Polys) {
  const { cols, rows } = b
  let x0 = cols
  let x1 = 0
  let y0 = rows
  let y1 = 0
  for (let i = 0; i < grid.length; i++) {
    if (!grid[i]) continue
    const x = i % cols
    const y = Math.floor(i / cols)
    x0 = Math.min(x0, x)
    x1 = Math.max(x1, x)
    y0 = Math.min(y0, y)
    y1 = Math.max(y1, y)
  }
  const names: string[] = []
  const count = new Map<string, number>()
  for (const comp of unnamed) {
    let outsideCells = 0
    for (const i of comp) {
      const x = i % cols
      const y = Math.floor(i / cols)
      if (x < x0 || x > x1 || y < y0 || y > y1) outsideCells++
    }
    const balcony = outsideCells > comp.length * 0.4
    const base = balcony ? 'Balkong' : 'Rum'
    const c = (count.get(base) ?? 0) + 1
    count.set(base, c)
    const name = c > 1 ? `${base} ${c}` : base
    const r = await ensure(name)
    const g = new Uint8Array(grid.length)
    for (const i of comp) g[i] = 1
    const p = polygonize(g, cols, rows, 1)
    if (p) {
      out[r.id] = p
      names.push(name)
    }
  }
  return names
}
