import { useRef, useState } from 'react'
import { api } from '../lib/api'
import type { PlanRect, Room } from '../types'
import type { ProjectState } from '../screens/ProjectView'
import { Chips, Loader, useToast } from './ui'

const clamp = (n: number) => Math.min(1, Math.max(0, n))
const roomStyle = (r: Room, rect: PlanRect) => ({
  left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%`,
  '--room-bg': `var(--c-${r.color}-bg)`, '--room-fg': `var(--c-${r.color}-fg)`,
}) as React.CSSProperties

// Planritningen med klickbara rum. I redigeringsläget drar man en ruta över varje rum.
export function FloorPlan({ state, onRoom }: { state: ProjectState; onRoom: (room: Room) => void }) {
  const toast = useToast()
  const project = state.project!
  const url = project.floorplan_path ? state.urls[project.floorplan_path] : undefined
  const input = useRef<HTMLInputElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [start, setStart] = useState<{ x: number; y: number } | null>(null)
  const [draft, setDraft] = useState<PlanRect | null>(null)

  const upload = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    try {
      const path = await api.uploadFile(project.id, file)
      if (project.floorplan_path) await api.removeFile(project.floorplan_path)
      await api.updateProject(project.id, { floorplan_path: path })
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
    setSelected((state.rooms.find((r) => !r.plan) ?? state.rooms[0])?.id ?? null)
  }

  const point = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect()
    return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) }
  }

  const onDown = (e: React.PointerEvent) => {
    if (!editing || !selected) return
    box.current!.setPointerCapture(e.pointerId)
    const p = point(e)
    setStart(p)
    setDraft({ x: p.x, y: p.y, w: 0, h: 0 })
  }
  const onMove = (e: React.PointerEvent) => {
    if (!start) return
    const p = point(e)
    setDraft({ x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) })
  }
  const onUp = () => {
    if (draft && selected && draft.w > 0.02 && draft.h > 0.02) {
      state.patch('rooms', selected, { plan: draft })
      // Hoppa vidare till nästa rum som saknar ruta.
      const next = state.rooms.find((r) => r.id !== selected && !r.plan)
      if (next) setSelected(next.id)
    }
    setStart(null)
    setDraft(null)
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

  return (
    <div>
      <div className="section-head">
        <h2>Planritning</h2>
        {editing ? (
          <button className="btn btn--secondary" onClick={() => setEditing(false)}>Klar</button>
        ) : (
          <>
            <button className="btn btn--ghost" onClick={() => input.current?.click()}>Byt bild</button>
            <button className="btn btn--secondary" onClick={startEditing}>Markera rum</button>
          </>
        )}
      </div>

      {editing && (
        <div className="plan-tools">
          <Chips value={selected} onChange={setSelected} options={state.rooms.map((r) => ({ value: r.id as string | null, label: r.name }))} />
          {current && (
            <div className="row" style={{ cursor: 'default', padding: 0 }}>
              <span className="status status--sent">Dra en ruta över {current.name.toLowerCase()}</span>
              {current.plan && <button className="btn btn--danger" onClick={() => state.patch('rooms', current.id, { plan: null })}>Ta bort ruta</button>}
            </div>
          )}
        </div>
      )}

      <div ref={box} className={`plan ${editing ? 'is-editing' : ''}`} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <img src={url} alt="Planritning" />
        {state.rooms.filter((r) => r.plan).map((r) => (
          <button key={r.id} className={`plan__room ${editing && r.id === selected ? 'is-selected' : ''}`} style={roomStyle(r, r.plan!)} onClick={() => onRoom(r)}>
            {r.name}
          </button>
        ))}
        {draft && <div className="plan__draft" style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%`, width: `${draft.w * 100}%`, height: `${draft.h * 100}%` }} />}
      </div>
      {fileInput}
    </div>
  )
}
