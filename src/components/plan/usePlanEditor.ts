import { useEffect, useRef, useState } from 'react'
import { api } from '../../lib/api'
import { inside } from '../../lib/plangrid'
import { useToast } from '../ui'
import type { PlanMap, Pt, Room } from '../../types'
import { W, toPolys, type Polys } from './geometry'

// Rummens former på ritningen och redigeringen av dem: under "Justera" drar man i rummens hörn, ungefär som när
// man beskär en bild, och plustecknen mitt på kanterna ger nya hörn. Hörnen fäster mot andra rums hörn.
// Ändringar sparas en stund efter att man har släppt, och Ångra går tillbaka ett steg i taget.
export function usePlanEditor({ projectId, map, rooms, H }: { projectId: string; map: PlanMap | null; rooms: Room[]; H: number }) {
  const toast = useToast()
  const svg = useRef<SVGSVGElement>(null)
  const [polys, setPolys] = useState<Polys>(() => toPolys(map))
  const [editing, setEditing] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [vertex, setVertex] = useState<number | null>(null)
  const [picking, setPicking] = useState(false)
  const undo = useRef<Polys[]>([])
  const drag = useRef<{ kind: 'vertex' | 'move'; i: number; start: Pt; orig: Pt[]; moved: boolean } | null>(null)
  const saveTimer = useRef<number>(undefined)

  // Ändringar från någon annan syns när man inte själv redigerar.
  useEffect(() => {
    if (!editing) setPolys(toPolys(map))
  }, [map])

  const roomById = (id: string) => rooms.find((r) => r.id === id)
  const shown = Object.entries(polys).filter(([id, p]) => roomById(id) && p.length >= 3)

  const save = (next: Polys) => {
    clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      api.updateProject(projectId, { floorplan_map: { v: 2, rooms: next } }).catch((err) => toast({ title: 'Planritningen kunde inte sparas', body: err.message }))
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
  // En ny bild: inga rum och ingen historik.
  const reset = () => {
    setPolys({})
    undo.current = []
  }

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

  const onPointerDown = (e: React.PointerEvent) => {
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

  const onPointerMove = (e: React.PointerEvent) => {
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

  const onPointerUp = () => {
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
  const sel = selected ? polys[selected] : null
  const removeVertex = () => {
    if (!selected || !sel || vertex === null) return
    snapshot()
    commit({ ...polys, [selected]: sel.filter((_, i) => i !== vertex) })
    setVertex(null)
  }
  const removeRoom = () => {
    if (!selected) return
    snapshot()
    const n = { ...polys }
    delete n[selected]
    commit(n)
    setSelected(null)
  }
  const undoLast = () => {
    const prev = undo.current.pop()
    if (prev) commit(prev)
  }
  const finish = () => {
    setEditing(false)
    setSelected(null)
    setVertex(null)
    setPicking(false)
  }

  return {
    svg, polys, shown, sel, editing, setEditing, selected, vertex, picking, setPicking,
    canUndo: undo.current.length > 0, snapshot, commit, reset, undoLast, finish, place, removeVertex, removeRoom, startVertex, px,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  }
}
