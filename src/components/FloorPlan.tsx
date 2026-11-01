import { useEffect, useMemo, useRef, useState } from 'react'
import { IconArrowBackUp } from '@tabler/icons-react'
import { api } from '../lib/api'
import { growRooms, fromV1, inside, labelPoint, loadBarriers, polygonize, type Barriers } from '../lib/plangrid'
import { presetFor, readRoomNames } from '../lib/readplan'
import type { PlanMap, Pt, Room } from '../types'
import type { ProjectState } from '../screens/ProjectView'
import { Loader, useToast } from './ui'

type Polys = Record<string, Pt[]>
const W = 1000 // bredden i SVG:ns koordinater; höjden följer bildens proportioner

const toPolys = (m: PlanMap | null): Polys => (!m ? {} : 'v' in m ? { ...m.rooms } : fromV1(m))

// Planritningen. Tryck på ett rum för att öppna det. Under "Justera" drar man i rummens hörn,
// ungefär som när man beskär en bild, och plustecknen mitt på kanterna ger nya hörn.
export function FloorPlan({ state, onRoom, onAddRoom }: { state: ProjectState; onRoom: (room: Room) => void; onAddRoom: () => void }) {
  const toast = useToast()
  const project = state.project!
  const url = project.floorplan_path ? state.urls[project.floorplan_path] : undefined
  const input = useRef<HTMLInputElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const [aspect, setAspect] = useState(0.75)
  const [polys, setPolys] = useState<Polys>(() => toPolys(project.floorplan_map))
  const [editing, setEditing] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [vertex, setVertex] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [detecting, setDetecting] = useState<number | null>(null)
  const [picking, setPicking] = useState(false)
  const undo = useRef<Polys[]>([])
  const drag = useRef<{ kind: 'vertex' | 'move'; i: number; start: Pt; orig: Pt[]; moved: boolean } | null>(null)
  const saveTimer = useRef<number>(undefined)
  const autoDetect = useRef(false)
  const H = W * aspect

  // Ändringar från någon annan syns när man inte själv redigerar.
  useEffect(() => {
    if (!editing) setPolys(toPolys(project.floorplan_map))
  }, [project.floorplan_map])

  const rooms = state.rooms
  const roomById = (id: string) => rooms.find((r) => r.id === id)
  const shown = Object.entries(polys).filter(([id, p]) => roomById(id) && p.length >= 3)

  const save = (next: Polys) => {
    clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      api.updateProject(project.id, { floorplan_map: { v: 2, rooms: next } }).catch((err) => toast({ title: 'Planritningen kunde inte sparas', body: err.message }))
    }, 400)
  }
  const commit = (next: Polys) => {
    setPolys(next)
    save(next)
  }
  const snapshot = () => {
    undo.current.push(structuredClone(polys))
    if (undo.current.length > 40) undo.current.shift()
  }

  // ---------- Läs rummen ur ritningen ----------

  const detect = async (src = url) => {
    if (!src) return
    if (shown.length && !autoDetect.current && !confirm('Läsa ritningen igen? Rummen du justerat ritas om.')) return
    autoDetect.current = false
    setEditing(false)
    setDetecting(0)
    try {
      const [b, found] = await Promise.all([loadBarriers(src), readRoomNames(src, setDetecting)])
      const list = [...rooms]
      const ensure = async (name: string) => {
        let r = list.find((x) => x.name.toLowerCase() === name.toLowerCase())
        if (!r) {
          r = await api.insert<Room>('rooms', { project_id: project.id, name, ...presetFor(name), sort: list.length })
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
      const next: Polys = {}
      named.forEach((r, k) => {
        const p = polygonize(grid, b.cols, b.rows, k + 1)
        if (p) next[r.id] = p
      })
      // Stängda ytor utan namn: det som sticker ut från bostaden är troligen en balkong.
      const extra = await guessUnnamed(b, grid, unnamed, ensure, next)
      snapshot()
      commit(next)
      await state.reload()
      const names = [...named.map((r) => r.name), ...extra]
      if (!names.length) {
        toast({ title: 'Hittade inga rum', body: 'Lägg till rummen under Justera.' })
        setEditing(true)
      } else toast({ title: `Hittade ${names.length} rum`, body: names.join(', ') + '. Ändra under Justera om något blev fel.' })
    } catch (err: any) {
      toast({ title: 'Ritningen kunde inte läsas', body: err.message })
    } finally {
      setDetecting(null)
    }
  }

  const upload = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    try {
      const path = await api.uploadFile(project.id, file)
      if (project.floorplan_path) await api.removeFile(project.floorplan_path)
      await api.updateProject(project.id, { floorplan_path: path, floorplan_map: null })
      setPolys({})
      undo.current = []
      autoDetect.current = true
      await state.reload()
    } catch (err: any) {
      toast({ title: 'Planritningen kunde inte laddas upp', body: err.message })
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  // En nyss uppladdad ritning läses direkt.
  useEffect(() => {
    if (url && autoDetect.current) detect(url)
  }, [url])

  // ---------- Dra i hörn ----------

  const px = () => (svg.current ? W / svg.current.getBoundingClientRect().width : 1) // SVG-enheter per skärmpixel
  const pointAt = (e: React.PointerEvent): Pt => {
    const r = svg.current!.getBoundingClientRect()
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }
  }

  // Hörnet fäster mot andra rums hörn och blir rakt i linje med sina grannar.
  const snap = (p: Pt, poly: Pt[], i: number): Pt => {
    const k = px()
    const near = (a: number, b: number, scale: number, limit: number) => Math.abs(a - b) * scale / k < limit
    let q = { ...p }
    for (const [id, other] of shown) {
      if (id === selected) continue
      for (const o of other) if (near(o.x, q.x, W, 14) && near(o.y, q.y, H, 14)) return { ...o }
    }
    for (const n of [poly[(i - 1 + poly.length) % poly.length], poly[(i + 1) % poly.length]]) {
      if (near(n.x, q.x, W, 9)) q.x = n.x
      if (near(n.y, q.y, H, 9)) q.y = n.y
    }
    return q
  }

  const startVertex = (e: React.PointerEvent, i: number, insert = false) => {
    e.stopPropagation()
    if (!selected) return
    svg.current!.setPointerCapture(e.pointerId)
    snapshot()
    let poly = polys[selected]
    if (insert) {
      const a = poly[i]
      const b = poly[(i + 1) % poly.length]
      poly = [...poly.slice(0, i + 1), { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, ...poly.slice(i + 1)]
      setPolys({ ...polys, [selected]: poly })
      i = i + 1
    }
    drag.current = { kind: 'vertex', i, start: pointAt(e), orig: poly, moved: insert }
  }

  const onSvgDown = (e: React.PointerEvent) => {
    if (!editing) return
    const p = pointAt(e)
    const hit = [...shown].reverse().find(([, poly]) => inside(poly, p))
    if (!hit) {
      setSelected(null)
      setVertex(null)
      return
    }
    setVertex(null)
    if (hit[0] !== selected) {
      setSelected(hit[0])
      return
    }
    svg.current!.setPointerCapture(e.pointerId)
    snapshot()
    drag.current = { kind: 'move', i: -1, start: p, orig: polys[hit[0]], moved: false }
  }

  const onSvgMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || !selected) return
    const p = pointAt(e)
    if (Math.hypot((p.x - d.start.x) * W, (p.y - d.start.y) * H) / px() > 3) d.moved = true
    if (!d.moved) return
    if (d.kind === 'vertex') {
      const poly = [...d.orig]
      poly[d.i] = snap(p, poly, d.i)
      setPolys((cur) => ({ ...cur, [selected]: poly }))
    } else {
      const dx = p.x - d.start.x
      const dy = p.y - d.start.y
      setPolys((cur) => ({ ...cur, [selected]: d.orig.map((q) => ({ x: q.x + dx, y: q.y + dy })) }))
    }
  }

  const onSvgUp = () => {
    const d = drag.current
    drag.current = null
    if (!d) return
    if (!d.moved) {
      undo.current.pop()
      if (d.kind === 'vertex') setVertex(d.i)
      return
    }
    save(polys)
  }

  // Lägg ett rum på ritningen som en rektangel mitt i bilden.
  const place = (room: Room) => {
    snapshot()
    commit({ ...polys, [room.id]: [{ x: 0.4, y: 0.4 }, { x: 0.6, y: 0.4 }, { x: 0.6, y: 0.6 }, { x: 0.4, y: 0.6 }] })
    setSelected(room.id)
    setPicking(false)
  }

  const labels = useMemo(() => shown.map(([id, p]) => ({ id, room: roomById(id)!, at: labelPoint(p) })), [polys, rooms])

  const fileInput = <input ref={input} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0])} />

  if (busy) return <Loader />

  if (!url) {
    return (
      <div>
        <div className="section-head"><h2>Planritning</h2></div>
        <div className="empty" style={{ padding: 0 }}>
          <h3>Ingen planritning</h3>
          <button className="btn btn--secondary" onClick={() => input.current?.click()}>Lägg till planritning</button>
        </div>
        {fileInput}
      </div>
    )
  }

  const sel = selected ? polys[selected] : null
  const selRoom = selected ? roomById(selected) : undefined
  const k = px()
  const missing = rooms.filter((r) => !polys[r.id])

  return (
    <div>
      <div className="section-head">
        <h2>Planritning</h2>
        {editing && (
          <>
            <button
              className="btn btn--ghost"
              aria-label="Ångra"
              disabled={!undo.current.length}
              onClick={() => {
                const prev = undo.current.pop()
                if (prev) commit(prev)
              }}
            >
              <IconArrowBackUp size={18} />
            </button>
            <button className="btn btn--secondary" onClick={() => { setEditing(false); setSelected(null); setVertex(null); setPicking(false) }}>Klar</button>
          </>
        )}
      </div>

      {!editing && detecting === null && (
        <div className="plan-tools" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 'var(--s-2)' }}>
          <button className="btn btn--secondary" onClick={() => detect()}>Hitta rum</button>
          <button className="btn btn--ghost" onClick={() => setEditing(true)}>Justera</button>
          <button className="btn btn--ghost" onClick={() => input.current?.click()}>Byt bild</button>
        </div>
      )}

      {detecting !== null && (
        <div className="plan-tools">
          <Loader />
          <span className="status status--sent">{detecting > 0 ? `Läser rumsnamnen i ritningen, ${Math.round(detecting * 100)} %` : 'Förbereder läsningen av ritningen'}</span>
        </div>
      )}

      {editing && (
        <div className="plan-tools">
          {selRoom ? (
            <div className="chips">
              <span className="status status--sent" style={{ marginRight: 'auto' }}>{selRoom.name}: dra i hörnen</span>
              {vertex !== null && sel && sel.length > 3 && (
                <button className="chip" onClick={() => { snapshot(); commit({ ...polys, [selected!]: sel.filter((_, i) => i !== vertex) }); setVertex(null) }}>Ta bort hörn</button>
              )}
              <button className="chip" onClick={() => { snapshot(); const n = { ...polys }; delete n[selected!]; commit(n); setSelected(null) }}>Ta bort från ritningen</button>
            </div>
          ) : picking ? (
            <div className="chips">
              {missing.map((r) => <button key={r.id} className="chip" onClick={() => place(r)}>{r.name}</button>)}
              <button className="chip" onClick={() => { setPicking(false); onAddRoom() }}>Nytt rum</button>
            </div>
          ) : (
            <div className="chips">
              <span className="status status--sent" style={{ marginRight: 'auto' }}>Tryck på ett rum för att ändra det</span>
              <button className="chip" onClick={() => setPicking(true)}>Lägg till rum</button>
            </div>
          )}
        </div>
      )}

      <div className={`plan ${editing ? 'is-editing' : ''}`}>
        <img src={url} alt="Planritning" crossOrigin="anonymous" onLoad={(e) => setAspect(e.currentTarget.naturalHeight / e.currentTarget.naturalWidth)} />
        <svg
          ref={svg}
          className="plan__layer"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          onPointerDown={onSvgDown}
          onPointerMove={onSvgMove}
          onPointerUp={onSvgUp}
          onPointerCancel={onSvgUp}
        >
          {shown.map(([id, p]) => {
            const r = roomById(id)!
            return (
              <polygon
                key={id}
                className={`plan__room ${id === selected ? 'is-selected' : ''}`}
                points={p.map((q) => `${q.x * W},${q.y * H}`).join(' ')}
                style={{ fill: `var(--c-${r.color}-bg)` }}
                onClick={() => !editing && onRoom(r)}
              />
            )
          })}
          {editing && sel && (
            <g>
              {/* Plus mitt på kanter som är långa nog; ger ett nytt hörn när man drar i det. */}
              {sel.map((a, i) => {
                const b = sel[(i + 1) % sel.length]
                if (Math.hypot((b.x - a.x) * W, (b.y - a.y) * H) / k < 44) return null
                const cx = ((a.x + b.x) / 2) * W
                const cy = ((a.y + b.y) / 2) * H
                return (
                  <g key={`m${i}`} onPointerDown={(e) => startVertex(e, i, true)}>
                    <circle className="plan__hit" cx={cx} cy={cy} r={16 * k} />
                    <circle className="plan__mid" cx={cx} cy={cy} r={5 * k} />
                  </g>
                )
              })}
              {sel.map((a, i) => (
                <g key={`v${i}`} onPointerDown={(e) => startVertex(e, i)}>
                  <circle className="plan__hit" cx={a.x * W} cy={a.y * H} r={20 * k} />
                  <circle className={`plan__vertex ${vertex === i ? 'is-active' : ''}`} cx={a.x * W} cy={a.y * H} r={7 * k} />
                </g>
              ))}
            </g>
          )}
        </svg>
        {labels.map((l) => (
          <span key={l.id} className="plan__label" style={{ left: `${l.at.x * 100}%`, top: `${l.at.y * 100}%`, color: `var(--c-${l.room.color}-fg)` }}>
            {l.room.name}
          </span>
        ))}
      </div>
      {fileInput}
    </div>
  )
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
