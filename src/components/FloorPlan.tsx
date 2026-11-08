import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { IconArrowBackUp, IconRestore } from '@tabler/icons-react'
import { api } from '../lib/api'
import { labelPoint } from '../lib/plangrid'
import { allItems } from '../lib/items'
import { kr } from '../lib/format'
import type { Room } from '../types'
import type { ProjectState } from '../lib/useProject'
import { Loader, useToast } from './ui'
import { Copilot } from './Copilot'
import { W, dec, paint, polyArea } from './plan/geometry'
import { detectRooms } from './plan/detect'
import { usePlanEditor } from './plan/usePlanEditor'
import { usePlanWalls } from './plan/usePlanWalls'
import { PlanBar } from './plan/PlanBar'

// Verktygen i Projektläget (verktygslådan bredvid ritningen). Rummens kanter är väggarna.
export type PlanTool = 'measure' | 'demolish' | 'area' | 'cost'

// Planritningen: bilden med rummen ovanpå. Tryck på ett rum för att öppna det. Delarna ligger i components/plan/:
// geometry (mått och färger), detect (läsa rummen ur bilden), usePlanEditor (Justera: dra i hörnen),
// usePlanWalls (riva väggar, sammanslagna rum och AI-raden) och PlanBar (rubriken och knapparna ovanför).
// Med ett verktyg valt blir väggarna klickbara (mät, markera för rivning) eller rummen (kalkylera yta, kostnadskarta).
// stage: arbetsytan i Projektläget. Ritningen ryms i kortets höjd, rumsnamnen syns när man håller över (ytan visar namnet),
// AI-raden ligger längst ner och Förstora (onExpand) öppnar arbetsytan i helskärm.
export function FloorPlan({ state, onRoom, onAddRoom, tool = null, stage = false, expanded = false, onExpand }: { state: ProjectState; onRoom: (room: Room) => void; onAddRoom: () => void; tool?: PlanTool | null; stage?: boolean; expanded?: boolean; onExpand?: () => void }) {
  const toast = useToast()
  const still = useReducedMotion()
  const project = state.project!
  const rooms = state.rooms
  const roomById = (id: string) => rooms.find((r) => r.id === id)
  const url = project.floorplan_path ? state.urls[project.floorplan_path] : undefined
  const input = useRef<HTMLInputElement>(null)
  const [aspect, setAspect] = useState(0.75)
  const H = W * aspect
  const [busy, setBusy] = useState(false)
  const [detecting, setDetecting] = useState<number | null>(null)
  const autoDetect = useRef(false)
  const maskId = `plan-cut-${useId().replace(/:/g, '')}`

  const ed = usePlanEditor({ projectId: project.id, map: project.floorplan_map, rooms, H })
  const { shown, polys, editing } = ed

  // Verktygen: den uppmätta väggen, rummet vars yta visas och rummet under pekaren.
  const [measured, setMeasured] = useState<string | null>(null)
  const [areaRoom, setAreaRoom] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  useEffect(() => {
    setMeasured(null)
    setAreaRoom(null)
  }, [tool])

  // Skalan kommer från boarean: rummens sammanlagda yta på ritningen motsvarar boarean i kvm.
  // Utan boarea går det bara att visa hur stor del av ytan ett rum är.
  const drawnArea = shown.reduce((s, [, p]) => s + polyArea(p, H), 0)
  const boarea = project.economy?.area
  const m2PerUnit = boarea && drawnArea ? boarea / drawnArea : null
  const sizeText = (a: number) => (m2PerUnit ? `≈ ${dec(a * m2PerUnit)} m²` : `${Math.round((a / drawnArea) * 100)} % av ytan`)

  const wl = usePlanWalls({ projectId: project.id, shown, polys, rooms, H, aspect, onArea: setAreaRoom, sizeText })
  const { gone, shared, goneWalls, groupOf, groupArea, lead, groupName, flashWall } = wl

  // ---------- Läs rummen ur ritningen ----------

  const detect = async (src = url) => {
    if (!src) return
    if (shown.length && !autoDetect.current && !confirm('Läsa ritningen igen? Rummen du justerat ritas om.')) return
    autoDetect.current = false
    ed.setEditing(false)
    setDetecting(0)
    try {
      const { polys: next, names } = await detectRooms(src, rooms, project.id, setDetecting)
      ed.snapshot()
      ed.commit(next)
      await state.reload()
      if (!names.length) {
        toast({ title: 'Hittade inga rum', body: 'Lägg till rummen under Justera.' })
        ed.setEditing(true)
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
      ed.reset()
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

  const labels = useMemo(() => shown.map(([id, p]) => ({ id, room: roomById(id)!, at: labelPoint(p) })), [polys, rooms])
  // Kanterna, för att mäta en vägg.
  const walls = shown.flatMap(([id, p]) => p.map((a, i) => ({ key: `${id}:${i}`, a, b: p[(i + 1) % p.length] })))
  const wallLength = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot((b.x - a.x) * W, (b.y - a.y) * H)
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

  const sel = ed.sel
  const k = ed.px()

  return (
    <div>
      <PlanBar ed={ed} rooms={rooms} detecting={detecting} expanded={expanded} onExpand={onExpand} onDetect={() => detect()} onReplace={() => input.current?.click()} onAddRoom={onAddRoom} />

      <div className={`plan ${editing ? 'is-editing' : ''} ${wallTool ? 'has-wall-tool' : ''} ${tool && !editing ? `tool-${tool}` : ''} ${stage ? 'is-stage' : ''}`} style={{ '--plan-aspect': aspect } as React.CSSProperties}>
        {/* Bilden ger planens storlek; den syns i SVG:n nedan, där rivna väggar kan tonas bort med en mask. */}
        <img className="plan__size" src={url} alt="Planritning" crossOrigin="anonymous" onLoad={(e) => setAspect(e.currentTarget.naturalHeight / e.currentTarget.naturalWidth)} />
        <svg ref={ed.svg} className="plan__layer" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" {...ed.handlers}>
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
          <image href={url} x="0" y="0" width={W} height={H} preserveAspectRatio="none" className="plan__image" mask={`url(#${maskId})`} />

          {shown.map(([id, p]) => {
            const r = roomById(id)!
            const c = costMode ? accent : paint(roomById(lead(id))!.color)
            return (
              <motion.polygon
                key={id}
                className={`plan__room ${id === ed.selected ? 'is-selected' : ''} ${shownArea && groupOf(shownArea).includes(id) ? 'is-lit' : ''} ${groupOf(id).length > 1 ? 'is-merged' : ''}`}
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
                style={costMode ? { fill: accent, fillOpacity: heat(w.rooms[0]) * 0.6 } : { fill: paint(roomById(lead(w.rooms[0]))!.color) }}
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
              onClick={() => wl.demolish(w.id)}
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
                  <g key={`m${i}`} onPointerDown={(e) => ed.startVertex(e, i, true)}>
                    <circle className="plan__hit" cx={cx} cy={cy} r={16 * k} />
                    <circle className="plan__mid" cx={cx} cy={cy} r={5 * k} />
                  </g>
                )
              })}
              {sel.map((a, i) => (
                <g key={`v${i}`} onPointerDown={(e) => ed.startVertex(e, i)}>
                  <circle className="plan__hit" cx={a.x * W} cy={a.y * H} r={20 * k} />
                  <circle className={`plan__vertex ${ed.vertex === i ? 'is-active' : ''}`} cx={a.x * W} cy={a.y * H} r={7 * k} />
                </g>
              ))}
            </g>
          )}
        </svg>
        {/* Kostnadskartan: vad varje rum (eller sammanslagen yta) har kostat, och totalen nere till vänster. */}
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
              <b>{sizeText(groupArea(shownArea))}</b>
              <small>{groupName(shownArea)}{m2PerUnit && groupOf(shownArea).length === 1 ? ` · ${Math.round((groupArea(shownArea) / drawnArea) * 100)} %` : ''}</small>
            </motion.span>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {gone.length > 0 && goneWalls.length > 0 && !editing && (
            <motion.div className="plan__chip" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
              <span>{goneWalls.length === 1 ? '1 vägg riven' : `${goneWalls.length} väggar rivna`}</span>
              <button type="button" onClick={wl.undoLast}><IconArrowBackUp size={14} /> Ångra</button>
              <button type="button" onClick={wl.restore}><IconRestore size={14} /> Återställ</button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {stage && !editing && <Copilot onAsk={wl.ask} />}
      {fileInput}
    </div>
  )
}
