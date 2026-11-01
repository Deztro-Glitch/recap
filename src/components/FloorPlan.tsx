import { useEffect, useMemo, useRef, useState } from 'react'
import { IconArrowBackUp } from '@tabler/icons-react'
import { api } from '../lib/api'
import { WALL, decode, encode, fill, labelPoints, loadBarriers, paint, roomAt, type Barriers, COLS } from '../lib/plangrid'
import type { Room } from '../types'
import type { ProjectState } from '../screens/ProjectView'
import { Chips, Loader, useToast } from './ui'

type Tool = 'fill' | 'brush' | 'wall' | 'erase'
const TOOL_LABEL: Record<Tool, string> = { fill: 'Fyll', brush: 'Pensel', wall: 'Vägg', erase: 'Sudd' }

// Läser en CSS-färg (t.ex. --c-sand-bg) som RGB.
function cssColor(name: string): [number, number, number] {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const m = v.match(/^#([0-9a-f]{6})$/i)
  if (!m) return [128, 128, 128]
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// Planritningen. Tryck i ett rum för att öppna det. I redigeringsläget fyller man rummen,
// och ritar egna väggar där rum går ihop utan vägg (t.ex. hall och vardagsrum).
export function FloorPlan({ state, onRoom, onAddRoom }: { state: ProjectState; onRoom: (room: Room) => void; onAddRoom: () => void }) {
  const toast = useToast()
  const project = state.project!
  const url = project.floorplan_path ? state.urls[project.floorplan_path] : undefined
  const input = useRef<HTMLInputElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [busy, setBusy] = useState(false)
  const [barriers, setBarriers] = useState<Barriers | null>(null)
  const grid = useRef<Uint8Array>(new Uint8Array(0))
  const ids = useRef<string[]>([])
  const undo = useRef<Uint8Array[]>([])
  const [version, setVersion] = useState(0)
  const [editing, setEditing] = useState(false)
  const [tool, setTool] = useState<Tool>('fill')
  const [selected, setSelected] = useState<string | null>(null)
  const [message, setMessage] = useState<{ kind: 'sent' | 'warning'; text: string } | null>(null)
  const last = useRef<number | null>(null)
  const saveTimer = useRef<number>(undefined)

  // Läs in väggarna ur bilden när den byts.
  useEffect(() => {
    if (!url) return
    let cancelled = false
    loadBarriers(url)
      .catch(() => {
        // Går bilden inte att läsa (t.ex. blockerad) blir det inga väggar; man får måla med pensel.
        const rows = Math.round(COLS * 0.75)
        return { cols: COLS, rows, wall: new Uint8Array(COLS * rows) }
      })
      .then((b) => {
        if (cancelled) return
        setBarriers(b)
        const d = decode(project.floorplan_map, b.cols, b.rows)
        grid.current = d.grid
        ids.current = d.ids
        setVersion((v) => v + 1)
      })
    return () => {
      cancelled = true
    }
  }, [url])

  // Ändringar från någon annan syns när man inte själv redigerar.
  useEffect(() => {
    if (editing || !barriers) return
    const d = decode(project.floorplan_map, barriers.cols, barriers.rows)
    grid.current = d.grid
    ids.current = d.ids
    setVersion((v) => v + 1)
  }, [project.floorplan_map])

  const roomOfValue = (v: number) => (v && v !== WALL ? state.rooms.find((r) => r.id === ids.current[v - 1]) : undefined)

  // Rita rummens färger ovanpå bilden.
  useEffect(() => {
    const c = canvas.current
    if (!c || !barriers) return
    c.width = barriers.cols
    c.height = barriers.rows
    const g = c.getContext('2d')!
    const img = g.createImageData(barriers.cols, barriers.rows)
    const colors = new Map<number, [number, number, number]>()
    const accent = cssColor('--accent')
    for (let i = 0; i < grid.current.length; i++) {
      const v = grid.current[i]
      if (!v) continue
      if (v === WALL) {
        if (!editing) continue
        img.data.set([...accent, 255], i * 4)
        continue
      }
      let col = colors.get(v)
      if (!col) {
        const r = roomOfValue(v)
        if (!r) continue
        col = cssColor(`--c-${r.color}-bg`)
        colors.set(v, col)
      }
      const on = editing && selected && ids.current[v - 1] === selected
      img.data.set([...col, on ? 220 : 170], i * 4)
    }
    g.putImageData(img, 0, 0)
  }, [version, barriers, editing, selected, state.rooms])

  const labels = useMemo(() => (barriers ? labelPoints(grid.current, barriers.cols) : new Map()), [version, barriers])

  const save = () => {
    clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      if (!barriers) return
      api.updateProject(project.id, { floorplan_map: encode(grid.current, barriers.cols, barriers.rows, ids.current) }).catch((err) =>
        toast({ title: 'Planritningen kunde inte sparas', body: err.message }),
      )
    }, 500)
  }

  const valueFor = (roomId: string) => {
    let i = ids.current.indexOf(roomId)
    if (i === -1) {
      ids.current.push(roomId)
      i = ids.current.length - 1
    }
    return i + 1
  }

  const cellAt = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect()
    const x = Math.min(barriers!.cols - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * barriers!.cols)))
    const y = Math.min(barriers!.rows - 1, Math.max(0, Math.floor(((e.clientY - r.top) / r.height) * barriers!.rows)))
    return y * barriers!.cols + x
  }

  const snapshot = () => {
    undo.current.push(grid.current.slice())
    if (undo.current.length > 30) undo.current.shift()
  }

  const onDown = (e: React.PointerEvent) => {
    if (!barriers) return
    const cell = cellAt(e)
    if (!editing) {
      const room = roomOfValue(roomAt(grid.current, barriers.cols, barriers.rows, cell))
      if (room) onRoom(room)
      return
    }
    if (tool === 'fill') {
      if (!selected) return
      snapshot()
      const before = roomOfValue(grid.current[cell])
      const res = fill(grid.current, barriers, cell, valueFor(selected))
      if (res === 'leak') {
        undo.current.pop()
        setMessage({ kind: 'warning', text: 'Rummet är inte stängt. Rita en vägg där det är öppet och fyll igen.' })
        setTool('wall')
      } else if (res === 'ok') {
        const now = state.rooms.find((r) => r.id === selected)
        setMessage(before && now ? { kind: 'warning', text: `${before.name} blev ${now.name.toLowerCase()}. Tryck på ångra om det blev fel.` } : null)
        setVersion((v) => v + 1)
        save()
        // Hoppa vidare till nästa rum som inte är ifyllt.
        const filled = new Set(Array.from(new Set(grid.current)).map((v) => ids.current[v - 1]))
        const next = state.rooms.find((r) => !filled.has(r.id))
        if (next) setSelected(next.id)
      } else undo.current.pop()
      return
    }
    if (tool === 'brush' && !selected) return
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    snapshot()
    last.current = cell
    stroke(cell)
  }

  const stroke = (cell: number) => {
    const value = tool === 'wall' ? WALL : tool === 'erase' ? 0 : valueFor(selected!)
    paint(grid.current, barriers!.cols, barriers!.rows, last.current ?? cell, cell, value, tool === 'wall' ? 0 : 2)
    last.current = cell
    setVersion((v) => v + 1)
  }

  const onMove = (e: React.PointerEvent) => {
    if (last.current === null) return
    stroke(cellAt(e))
  }
  const onUp = () => {
    if (last.current === null) return
    last.current = null
    save()
  }

  const upload = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    try {
      const path = await api.uploadFile(project.id, file)
      if (project.floorplan_path) await api.removeFile(project.floorplan_path)
      await api.updateProject(project.id, { floorplan_path: path, floorplan_map: null })
      undo.current = []
      await state.reload()
      startEditing()
    } catch (err: any) {
      toast({ title: 'Planritningen kunde inte laddas upp', body: err.message })
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  const startEditing = () => {
    setEditing(true)
    setTool('fill')
    setMessage(null)
    const filled = new Set(Array.from(new Set(grid.current)).map((v) => ids.current[v - 1]))
    setSelected((state.rooms.find((r) => !filled.has(r.id)) ?? state.rooms[0])?.id ?? null)
  }

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

  const current = state.rooms.find((r) => r.id === selected)
  const hint =
    message ??
    (tool === 'fill' && current ? { kind: 'sent' as const, text: `Tryck i ${current.name.toLowerCase()}` }
      : tool === 'wall' ? { kind: 'sent' as const, text: 'Dra en linje där rummen ska delas' }
      : tool === 'brush' && current ? { kind: 'sent' as const, text: `Måla ${current.name.toLowerCase()}` }
      : tool === 'erase' ? { kind: 'sent' as const, text: 'Sudda färg och egna väggar' }
      : null)

  return (
    <div>
      <div className="section-head">
        <h2>Planritning</h2>
        {editing ? (
          <>
            <button
              className="btn btn--ghost"
              aria-label="Ångra"
              disabled={!undo.current.length}
              onClick={() => {
                const prev = undo.current.pop()
                if (prev) {
                  grid.current = prev
                  setVersion((v) => v + 1)
                  save()
                }
              }}
            >
              <IconArrowBackUp size={18} />
            </button>
            <button className="btn btn--secondary" onClick={() => setEditing(false)}>Klar</button>
          </>
        ) : (
          <>
            <button className="btn btn--ghost" onClick={() => input.current?.click()}>Byt bild</button>
            <button className="btn btn--secondary" onClick={startEditing} disabled={!barriers}>Markera rum</button>
          </>
        )}
      </div>

      {editing && (
        <div className="plan-tools">
          <div className="chips">
            {state.rooms.map((r) => (
              <button key={r.id} className={`chip ${selected === r.id ? 'is-active' : ''}`} onClick={() => setSelected(r.id)}>
                <span className="row__swatch" style={{ background: `var(--c-${r.color}-bg)`, display: 'inline-block', marginRight: 6, verticalAlign: -1 }} />
                {r.name}
              </button>
            ))}
            <button className="chip" onClick={onAddRoom}>Nytt rum</button>
          </div>
          <Chips value={tool} onChange={(t) => { setTool(t); setMessage(null) }} options={(['fill', 'brush', 'wall', 'erase'] as Tool[]).map((t) => ({ value: t, label: TOOL_LABEL[t] }))} />
          {hint && <span className={`status status--${hint.kind}`}>{hint.text}</span>}
        </div>
      )}

      <div className={`plan ${editing ? 'is-editing' : ''}`}>
        <img src={url} alt="Planritning" crossOrigin="anonymous" />
        <canvas ref={canvas} className="plan__layer" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
        {barriers &&
          [...labels].map(([v, p]) => {
            const r = roomOfValue(v)
            if (!r) return null
            return (
              <span key={v} className="plan__label" style={{ left: `${((p.x + 0.5) / barriers.cols) * 100}%`, top: `${((p.y + 0.5) / barriers.rows) * 100}%`, color: `var(--c-${r.color}-fg)` }}>
                {r.name}
              </span>
            )
          })}
      </div>
      {fileInput}
    </div>
  )
}
