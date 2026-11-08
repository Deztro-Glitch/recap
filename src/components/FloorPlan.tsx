import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { IconArrowBackUp, IconArrowsMaximize, IconArrowsMinimize, IconDots, IconRestore } from '@tabler/icons-react'
import { mergeGroups, sharedWalls } from '../lib/walls'
import { api } from '../lib/api'
import { growRooms, fromV1, inside, labelPoint, loadBarriers, polygonize, type Barriers } from '../lib/plangrid'
import { presetFor, readRoomNames } from '../lib/readplan'
import type { PlanMap, Pt, Room } from '../types'
import type { ProjectState } from '../screens/ProjectView'
import { Loader, useToast } from './ui'
import { Copilot } from './Copilot'
import { allItems } from '../screens/tabs/Items'
import { kr } from '../lib/format'

type Polys = Record<string, Pt[]>
const W = 1000 // bredden i SVG:ns koordinater; höjden följer bildens proportioner

const toPolys = (m: PlanMap | null): Polys => (!m ? {} : 'v' in m ? { ...m.rooms } : fromV1(m))

// Verktygen i Projektläget (verktygslådan bredvid ritningen). Rummens kanter är väggarna.
export type PlanTool = 'measure' | 'demolish' | 'area' | 'cost'

const dec = (n: number, d = 1) => n.toLocaleString('sv-SE', { minimumFractionDigits: d, maximumFractionDigits: d })

// Rummens färger som riktiga färgvärden, så att framer-motion kan tona mellan dem när rum slås ihop.
const paints = new Map<string, string>()
const paint = (c: string) => {
  if (!paints.has(c)) paints.set(c, getComputedStyle(document.documentElement).getPropertyValue(`--c-${c}-bg`).trim() || '#A2C7F0')
  return paints.get(c)!
}

// Rivna väggar sparas i webbläsaren per hem, så att man kan leka med ritningen utan att något ändras på riktigt.
const wallKey = (pid: string) => `recap-rivna-${pid}`
const loadGone = (pid: string): string[] => {
  try { return JSON.parse(localStorage.getItem(wallKey(pid)) ?? '[]') } catch { return [] }
}

// Planritningen. Tryck på ett rum för att öppna det. Under "Justera" drar man i rummens hörn,
// ungefär som när man beskär en bild, och plustecknen mitt på kanterna ger nya hörn.
// Med ett verktyg valt blir väggarna klickbara (mät, markera för rivning) eller rummen (kalkylera yta).
// stage: arbetsytan i Projektläget. Ritningen ryms i kortets höjd, rumsnamnen syns när man håller över (ytan visar namnet),
// AI-raden ligger längst ner och Förstora (onExpand) öppnar arbetsytan i helskärm.
export function FloorPlan({ state, onRoom, onAddRoom, tool = null, stage = false, expanded = false, onExpand }: { state: ProjectState; onRoom: (room: Room) => void; onAddRoom: () => void; tool?: PlanTool | null; stage?: boolean; expanded?: boolean; onExpand?: () => void }) {
  const copilot = stage
  const toast = useToast()
  const project = state.project!
  const url = project.floorplan_path ? state.urls[project.floorplan_path] : undefined
  const input = useRef<HTMLInputElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const [aspect, setAspect] = useState(0.75)
  const [polys, setPolys] = useState<Polys>(() => toPolys(project.floorplan_map))
  const [editing, setEditing] = useState(false)
  const [tools, setTools] = useState(false)
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
  // Verktygen: rivna väggar (i ordning, för Ångra), den uppmätta väggen, rummet vars yta visas och rummet under pekaren.
  const still = useReducedMotion()
  const maskId = `plan-cut-${useId().replace(/:/g, '')}`
  const [gone, setGone] = useState<string[]>(() => loadGone(project.id))
  const [measured, setMeasured] = useState<string | null>(null)
  const [areaRoom, setAreaRoom] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)   // väggen AI:n ska riva blinkar först
  useEffect(() => {
    setMeasured(null)
    setAreaRoom(null)
  }, [tool])
  useEffect(() => {
    try { localStorage.setItem(wallKey(project.id), JSON.stringify(gone)) } catch { /* privat läge */ }
  }, [gone])

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

  // Skalan kommer från boarean: rummens sammanlagda yta på ritningen motsvarar boarean i kvm.
  // Utan boarea går det bara att visa hur stor del av ytan ett rum är.
  const polyArea = (p: Pt[]) => Math.abs(p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a.x * W * b.y * H - b.x * W * a.y * H }, 0)) / 2
  const drawnArea = shown.reduce((s, [, p]) => s + polyArea(p), 0)
  const boarea = project.economy?.area
  const m2PerUnit = boarea && drawnArea ? boarea / drawnArea : null
  // Kanterna (för att mäta) och väggarna mellan två rum (för att riva). Rivna väggar slår ihop rummen till grupper.
  const walls = shown.flatMap(([id, p]) => p.map((a, i) => ({ key: `${id}:${i}`, a, b: p[(i + 1) % p.length] })))
  const wallLength = (a: Pt, b: Pt) => Math.hypot((b.x - a.x) * W, (b.y - a.y) * H)
  const shared = useMemo(() => sharedWalls(shown, W, H), [polys, rooms, aspect])
  const goneWalls = shared.filter((w) => gone.includes(w.id))
  const groups = useMemo(() => mergeGroups(shown.map(([id]) => id), shared, gone), [shared, gone])
  const groupOf = (id: string) => groups.get(id) ?? [id]
  const groupArea = (id: string) => groupOf(id).reduce((s, x) => s + (polys[x] ? polyArea(polys[x]) : 0), 0)
  // Gruppens färg och namn kommer från det största rummet; namnen står i storleksordning.
  const bySize = (id: string) => [...groupOf(id)].sort((a, b) => polyArea(polys[b]) - polyArea(polys[a]))
  const lead = (id: string) => bySize(id)[0]
  const groupName = (id: string) => bySize(id).map((x) => roomById(x)?.name).join(' & ')
  const areaText = (id: string) => (m2PerUnit ? `≈ ${dec(groupArea(id) * m2PerUnit)} m²` : `${Math.round((groupArea(id) / drawnArea) * 100)} % av ytan`)

  const demolish = (id: string) => {
    const wall = shared.find((w) => w.id === id)
    if (gone.includes(id)) setGone(gone.filter((x) => x !== id))
    else {
      setGone([...gone, id])
      if (wall) setAreaRoom(wall.rooms[0])   // visa den sammanslagna ytan direkt
    }
  }
  // AI-raden (mockad tills den kopplas till AI:n): förstår "riv väggen (mellan X och Y)" och "återställ".
  // Väggen blinkar i rött och orange, tonas sedan bort och rummen slås ihop som när man river själv.
  const ask = async (text: string): Promise<string> => {
    const t = text.toLowerCase()
    if (/återställ|bygg upp|ångra allt/.test(t)) {
      setGone([])
      setAreaRoom(null)
      return gone.length ? 'Klart, alla väggar är tillbaka.' : 'Det finns inga rivna väggar att återställa.'
    }
    if (!/riv|ta bort|öppna upp|slå ihop/.test(t)) return 'Jag kan riva väggar mellan rum, t.ex. ”Riv väggen mellan kök och matsal”.'
    const name = (id: string) => roomById(id)?.name ?? ''
    const named = shown.map(([id]) => id).filter((id) => name(id) && t.includes(name(id).toLowerCase()))
    const standing = shared.filter((w) => !gone.includes(w.id))
    const between = (a: string, b: string) => standing.find((w) => w.rooms.includes(a) && w.rooms.includes(b))
    const byName = (a: string, b: string) => standing.find((w) => w.rooms.some((x) => name(x).toLowerCase().includes(a)) && w.rooms.some((x) => name(x).toLowerCase().includes(b)))
    const wall =
      named.length >= 2 ? between(named[0], named[1])
      : named.length === 1 ? standing.find((w) => w.rooms.includes(named[0]))
      : byName('kök', 'matsal') ?? standing[0]
    if (!wall) return named.length >= 2 ? `${name(named[0])} och ${name(named[1])} har ingen gemensam vägg som står kvar.` : 'Jag hittar ingen vägg att riva.'

    setFlash(wall.id)
    await new Promise((r) => setTimeout(r, still ? 0 : 950))
    setFlash(null)
    setGone((g) => (g.includes(wall.id) ? g : [...g, wall.id]))
    setAreaRoom(wall.rooms[0])
    const after = mergeGroups(shown.map(([id]) => id), shared, [...gone, wall.id]).get(wall.rooms[0]) ?? wall.rooms
    const sum = after.reduce((s, x) => s + polyArea(polys[x]), 0)
    const size = m2PerUnit ? `≈ ${dec(sum * m2PerUnit)} m²` : `${Math.round((sum / drawnArea) * 100)} % av ytan`
    return `Rev väggen mellan ${name(wall.rooms[0])} och ${name(wall.rooms[1])}. Den nya ytan blir ${size}.`
  }
  const flashWall = flash ? shared.find((w) => w.id === flash) : null

  const wallTool = !editing && (tool === 'measure' || tool === 'demolish')
  const m = walls.find((w) => w.key === measured)
  const shownArea = !editing ? areaRoom ?? (tool !== 'measure' && tool !== 'demolish' && tool !== 'cost' ? hover : null) : null

  // Kostnadskartan: allt som är klart i ett rum (köp, jobb och kvittorader), summerat per grupp av sammanslagna rum.
  // Rummen fylls i accentfärgen, starkare ju mer de har kostat jämfört med det dyraste.
  const costMode = tool === 'cost' && !editing
  const spentByRoom = useMemo(() => {
    const m = new Map<string, number>()
    for (const it of allItems(state)) if (it.done && it.room_id) m.set(it.room_id, (m.get(it.room_id) ?? 0) + it.amount)
    return m
  }, [state.purchases, state.tasks])
  const groupSpent = (id: string) => groupOf(id).reduce((s, x) => s + (spentByRoom.get(x) ?? 0), 0)
  const maxSpent = Math.max(1, ...shown.map(([id]) => groupSpent(id)))
  const totalSpent = shown.filter(([id]) => lead(id) === id).reduce((s, [id]) => s + groupSpent(id), 0)
  const accent = costMode ? getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#7C5CFF' : ''
  const heat = (id: string) => 0.06 + 0.64 * (groupSpent(id) / maxSpent)
  const areaPoly = shownArea ? polys[lead(shownArea)] : null

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
        {!editing && detecting === null && (
          <button className="btn btn--ghost" aria-label="Verktyg för planritningen" aria-expanded={tools} onClick={() => setTools(!tools)}>
            <IconDots size={18} />
          </button>
        )}
        {onExpand && !editing && detecting === null && (
          <button className="btn btn--ghost plan__expand" aria-label={expanded ? 'Förminska ritningen' : 'Förstora ritningen'} onClick={onExpand}>
            {expanded ? <IconArrowsMinimize size={18} /> : <IconArrowsMaximize size={18} />}
          </button>
        )}
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

      {/* Verktygen behövs sällan, så de ligger bakom knappen med tre prickar. */}
      {tools && !editing && detecting === null && (
        <div className="plan-tools" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 'var(--s-2)' }}>
          <button className="btn btn--secondary" onClick={() => { setTools(false); detect() }}>Hitta rum</button>
          <button className="btn btn--ghost" onClick={() => { setTools(false); setEditing(true) }}>Justera rummen</button>
          <button className="btn btn--ghost" onClick={() => { setTools(false); input.current?.click() }}>Byt bild</button>
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

      <div className={`plan ${editing ? 'is-editing' : ''} ${wallTool ? 'has-wall-tool' : ''} ${tool && !editing ? `tool-${tool}` : ''} ${stage ? 'is-stage' : ''}`} style={{ '--plan-aspect': aspect } as React.CSSProperties}>
        {/* Bilden ger planens storlek; den syns i SVG:n nedan, där rivna väggar kan tonas bort med en mask. */}
        <img className="plan__size" src={url} alt="Planritning" crossOrigin="anonymous" onLoad={(e) => setAspect(e.currentTarget.naturalHeight / e.currentTarget.naturalWidth)} />
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
          <defs>
            {/* Vitt syns, svart döljs: de rivna väggarna tonas bort ur ritningen. */}
            <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>
              <rect width={W} height={H} fill="#FFFFFF" />
              <AnimatePresence>
                {goneWalls.map((w) => (
                  <motion.line
                    key={w.id}
                    x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y}
                    stroke="#000000" strokeWidth={w.gap + 14}
                    initial={still ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.7, ease: [0.65, 0, 0.35, 1] }}
                  />
                ))}
              </AnimatePresence>
            </mask>
          </defs>
          {url && <image href={url} x="0" y="0" width={W} height={H} preserveAspectRatio="none" className="plan__image" mask={`url(#${maskId})`} />}

          {shown.map(([id, p]) => {
            const r = roomById(id)!
            const c = costMode ? accent : paint(roomById(lead(id))!.color)
            return (
              <motion.polygon
                key={id}
                className={`plan__room ${id === selected ? 'is-selected' : ''} ${shownArea && groupOf(shownArea).includes(id) ? 'is-lit' : ''} ${groupOf(id).length > 1 ? 'is-merged' : ''}`}
                points={p.map((q) => `${q.x * W},${q.y * H}`).join(' ')}
                initial={false}
                animate={costMode ? { fill: c, stroke: c, fillOpacity: heat(id) } : { fill: c, stroke: c, fillOpacity: 0.18 }}
                transition={{ duration: 0.8, ease: [0.65, 0, 0.35, 1] }}
                onPointerEnter={() => setHover(id)}
                onPointerLeave={() => setHover((h) => (h === id ? null : h))}
                onClick={() => {
                  if (editing) return
                  if (tool === 'area') setAreaRoom(id === areaRoom ? null : id)
                  else if (!tool || tool === 'cost') onRoom(r)
                }}
              />
            )
          })}
          {/* Där en vägg är riven fylls glipan mellan rummen med gruppens färg, så att de blir en yta. */}
          <AnimatePresence>
            {goneWalls.map((w) => (
              <motion.polygon
                key={`gap${w.id}`}
                className="plan__gap"
                points={w.quad.map((q) => `${q.x},${q.y}`).join(' ')}
                style={costMode ? { fill: accent, fillOpacity: heat(w.rooms[0]) * 0.6 } :{ fill: paint(roomById(lead(w.rooms[0]))!.color) }}
                initial={still ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.7, delay: still ? 0 : 0.2 }}
              />
            ))}
          </AnimatePresence>
          {/* Väggen AI:n ska riva blinkar till i rött och orange innan den tonas bort. */}
          {flashWall && (
            <motion.line
              key={`flash${flashWall.id}`}
              className="plan__wall-flash"
              x1={flashWall.a.x} y1={flashWall.a.y} x2={flashWall.b.x} y2={flashWall.b.y}
              strokeWidth={flashWall.gap + 10}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0.25, 1, 0.35, 1] }}
              transition={{ duration: 0.95, ease: 'easeInOut' }}
            />
          )}
          {m && <line className="plan__wall-measure" x1={m.a.x * W} y1={m.a.y * H} x2={m.b.x * W} y2={m.b.y * H} />}
          {!editing && tool === 'measure' && walls.map((w) => (
            <line
              key={w.key}
              className="plan__wall"
              x1={w.a.x * W} y1={w.a.y * H} x2={w.b.x * W} y2={w.b.y * H}
              onClick={() => setMeasured(w.key === measured ? null : w.key)}
            />
          ))}
          {/* Bara väggar mellan två rum går att riva. Rivna väggar visas streckade och kan klickas tillbaka. */}
          {!editing && tool === 'demolish' && shared.map((w) => (
            <line
              key={w.id}
              className={`plan__wall plan__wall--shared ${gone.includes(w.id) ? 'is-gone' : ''}`}
              x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y}
              style={{ strokeWidth: Math.max(14, w.gap + 8) }}
              onClick={() => demolish(w.id)}
            />
          ))}
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
        {/* Kostnadskartan: vad varje rum (eller sammanslagen yta) har kostat, och totalen uppe till vänster. */}
        <AnimatePresence>
          {costMode && labels.filter((l) => lead(l.id) === l.id && groupSpent(l.id) > 0).map((l, i) => (
            <motion.span
              key={`cost${l.id}${groupOf(l.id).length}`}
              className="plan__measure plan__measure--area plan__cost"
              style={{ left: `${l.at.x * 100}%`, top: `${l.at.y * 100}%` }}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 420, damping: 30, delay: still ? 0 : i * 0.04 }}
            >
              <b>{kr(groupSpent(l.id))}</b>
              <small>{groupName(l.id)}</small>
            </motion.span>
          ))}
          {costMode && (
            <motion.div key="cost-legend" className="plan__legend" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <span className="plan__legend-scale" aria-hidden />
              <span>{totalSpent > 0 ? `${kr(totalSpent)} i rummen` : 'Inget klart i rummen än'}</span>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Ett namn per grupp: sammanslagna rum får ett gemensamt namn på det största rummets plats. */}
        <AnimatePresence initial={false}>
          {labels.filter((l) => lead(l.id) === l.id).map((l) => (
            <motion.span
              key={l.id + groupOf(l.id).length}
              className="plan__label"
              style={{ left: `${l.at.x * 100}%`, top: `${l.at.y * 100}%` }}
              initial={{ opacity: 0 }}
              // På arbetsytan står namnet redan i ritningen; appens namn kommer med ytan när man håller över.
              animate={{ opacity: (stage ? !editing : costMode || (shownArea && lead(shownArea) === l.id)) ? 0 : 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
            >
              {groupName(l.id)}
            </motion.span>
          ))}
        </AnimatePresence>
        {m && (
          <span className="plan__measure" style={{ left: `${((m.a.x + m.b.x) / 2) * 100}%`, top: `${((m.a.y + m.b.y) / 2) * 100}%` }}>
            {m2PerUnit ? `≈ ${dec(wallLength(m.a, m.b) * Math.sqrt(m2PerUnit))} m` : 'Boarea saknas'}
          </span>
        )}
        {/* Ytan för rummet (eller de sammanslagna rummen) under pekaren, eller det man har klickat på. */}
        <AnimatePresence>
          {areaPoly && shownArea && (
            <motion.span
              key={lead(shownArea) + groupArea(shownArea)}
              className={`plan__measure plan__measure--area ${areaRoom ? 'is-pinned' : ''}`}
              style={{ left: `${labelPoint(areaPoly).x * 100}%`, top: `${labelPoint(areaPoly).y * 100}%` }}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            >
              <b>{areaText(shownArea)}</b>
              <small>{groupName(shownArea)}{m2PerUnit && groupOf(shownArea).length === 1 ? ` · ${Math.round((groupArea(shownArea) / drawnArea) * 100)} %` : ''}</small>
            </motion.span>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {gone.length > 0 && goneWalls.length > 0 && !editing && (
            <motion.div className="plan__chip" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
              <span>{goneWalls.length === 1 ? '1 vägg riven' : `${goneWalls.length} väggar rivna`}</span>
              <button type="button" onClick={() => { setGone(gone.slice(0, -1)); setAreaRoom(null) }}><IconArrowBackUp size={14} /> Ångra</button>
              <button type="button" onClick={() => { setGone([]); setAreaRoom(null) }}><IconRestore size={14} /> Återställ</button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {copilot && !editing && <Copilot onAsk={ask} />}
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
