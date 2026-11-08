import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { IconFileText, IconX } from '@tabler/icons-react'
import { daysLeft, kr } from '../../lib/format'
import { FloorPlan, type PlanTool } from '../../components/FloorPlan'
import { CareList, PlanToolbox, type useCare } from './ProjectHub'
import { iconFor } from '../../components/icons'
import { ease } from '../../components/ui'
import { CONTRACT_KIND_LABEL, PALETTE, tileStyle, type Room } from '../../types'
import type { ProjectState, ViewProps } from '../view'
import { ContractStatus } from './Contracts'
import { ItemList, sheetFor, useMarkDone } from './Items'
import { allItems, byDate, byImportance, roomFacts, sum, type Item } from '../../lib/items'
import { RoomPhotos } from './Photos'
import { RoomEditSheet } from './Rooms'
import { GlassCard } from '../../components/GlassCard'

// Hemmet: planritningen som en arbetsyta med verktygslådan och AI-raden, och en panel som visar hemmet
// (Senast och Underhåll) eller det rum man tryckt på. Planritningen finns bara här.
export function Overview({ state, open, place, setPlace, care }: ViewProps & { place: string | null; setPlace: (id: string | null) => void; care: ReturnType<typeof useCare> }) {
  const project = state.project!
  // Det som hör till bostaden: renoveringen och allt som har ett rum. Mat och annan vardag finns under Ekonomi.
  const items = allItems(state).filter((i) => i.scope === 'build' || i.room_id)
  const room = state.rooms.find((r) => r.id === place) ?? null
  const panel = useRef<HTMLDivElement>(null)
  const [tool, setTool] = useState<PlanTool | null>(null)
  // Förstora: arbetsytan i helskärm. Esc eller knappen igen lägger tillbaka den.
  const [full, setFull] = useState(false)
  useEffect(() => {
    if (!full) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !tool && setFull(false)
    addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [full, tool])

  // På mobilen ligger panelen under ritningen, så den rullas fram när man väljer ett rum.
  useEffect(() => {
    if (room && matchMedia('(max-width: 1024px)').matches) panel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [room?.id])

  // Rummen som rutor när det inte finns någon planritning.
  const roomTiles = !project.floorplan_path && state.rooms.length > 0 && (
    <div className="tiles">
      {state.rooms.map((r, i) => {
        const Icon = iconFor(r.icon)
        return (
          <motion.button key={r.id} className={`glass tile ${r.id === place ? 'is-selected' : ''}`} style={tileStyle(r.color ?? PALETTE[i % PALETTE.length])} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: i * 0.03, ease }} onClick={() => setPlace(r.id === place ? null : r.id)}>
            <div className="tile__name">{r.name}</div>
            <Icon className="tile__icon" />
          </motion.button>
        )
      })}
    </div>
  )
  const sidePanel = (
    <aside className="panel glass" ref={panel}>
      {room ? <RoomPanel state={state} open={open} room={room} onClose={() => setPlace(null)} /> : <HomePanel state={state} open={open} items={items} />}
      {/* Underhållet ligger i panelen, under hemmet. */}
      {!room && <CareList items={care.items} done={care.done} />}
    </aside>
  )

  return (
    <div>
      <div className="section-head">
        <h1>Hemmet</h1>
      </div>

      <div className={`workspace ${project.floorplan_path ? 'has-plan' : ''}`}>
        <div className="workspace__stage">
          {roomTiles}
          {/* Arbetsytan: punktrutnät, verktygslådan uppe till vänster och AI-raden svävande längst ner. */}
          <AnimatePresence>
            {full && <motion.div className="stage-scrim" onClick={() => setFull(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} />}
          </AnimatePresence>
          <GlassCard className={`plan-card plan-card--stage ${project.floorplan_path ? 'has-tools' : ''} ${full ? 'is-full' : ''}`} lift={false}>
            {project.floorplan_path && <PlanToolbox tool={tool} onTool={setTool} />}
            <FloorPlan state={state} tool={tool} stage={!!project.floorplan_path} expanded={full} onExpand={() => setFull(!full)} onRoom={(r) => setPlace(r.id === place ? null : r.id)} onAddRoom={() => open({ t: 'room' })} />
          </GlassCard>
        </div>
        {sidePanel}
      </div>
    </div>
  )
}

function HomePanel({ state, open, items }: { state: ProjectState; open: ViewProps['open']; items: Item[] }) {
  // Avtal syns här bara när något snart går ut. Resten finns under Mer.
  const coming = state.contracts.filter((c) => c.ends_on && daysLeft(c.ends_on) <= 30 && daysLeft(c.ends_on) >= -30).sort((a, b) => a.ends_on!.localeCompare(b.ends_on!))
  const latest = items.filter((i) => i.done).sort(byDate).slice(0, 5)
  const roomName = (id: string | null) => state.rooms.find((r) => r.id === id)?.name

  return (
    <>
      <div className="section-head"><h2>{state.project!.name}</h2></div>
      {coming.length > 0 && (
        <div className="section">
          <div className="section-head"><h3>Går snart ut</h3></div>
          <div className="rows">
            {coming.map((c) => (
              <GlassCard key={c.id} className="row" onClick={() => open({ t: 'contract', item: c })}>
                <div className="row__main">
                  <span className="menu-row__icon"><IconFileText size={18} /></span>
                  <div className="row__text">
                    <div className="row__title">{CONTRACT_KIND_LABEL[c.kind]} · {c.provider}</div>
                    <ContractStatus c={c} />
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        </div>
      )}
      <div className="section">
        <div className="section-head"><h3>Senast</h3></div>
        {latest.length ? (
          <div className="rows">
            {latest.map((i) => (
              <GlassCard key={i.id} className="row" onClick={() => open(sheetFor(i))}>
                <div className="row__text">
                  <div className="row__title">{i.title}</div>
                  <div className="meta">{[i.date && new Date(i.date).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }), roomName(i.room_id)].filter(Boolean).join(' · ')}</div>
                </div>
                {i.amount > 0 && <span className="row__amount">{kr(i.amount)}</span>}
              </GlassCard>
            ))}
          </div>
        ) : (
          <p className="meta">Inget klart än</p>
        )}
      </div>
    </>
  )
}

// Allt som hör till ett rum: färgkoder och mått, planerat och klart, foton.
function RoomPanel({ state, open, room, onClose }: { state: ProjectState; open: ViewProps['open']; room: Room; onClose: () => void }) {
  const [editing, setEditing] = useState(false)
  // I rummet syns allt som hör till rummet, oavsett läge.
  const items = allItems(state).filter((i) => i.room_id === room.id)
  const { markDone, field } = useMarkDone(state)
  const facts = roomFacts(allItems(state).filter((i) => i.room_id === room.id))

  return (
    <>
      {field}
      <div className="section-head">
        <h2>{room.name}</h2>
        <button className="btn btn--ghost" onClick={() => setEditing(true)}>Ändra</button>
        <button className="btn btn--ghost" aria-label="Stäng rummet" onClick={onClose}><IconX size={18} /></button>
      </div>
      {facts.length > 0 && (
        <dl className="facts">
          {facts.map((d) => (
            <div key={d.label + d.value}><dt className="meta">{d.label}</dt><dd>{d.value}</dd></div>
          ))}
        </dl>
      )}
      <div className="section">
        <div className="section-head">
          <h3>Planerat</h3>
          <span className="meta">{kr(sum(items.filter((i) => !i.done)))}</span>
          <button className="btn btn--ghost" onClick={() => open({ t: 'purchase', item: { room_id: room.id, scope: 'build' } })}>Lägg till</button>
        </div>
        <ItemList items={items.filter((i) => !i.done).sort(byImportance)} state={state} open={open} onCheck={markDone} empty="Inget planerat" hideRoom />
      </div>
      <div className="section">
        <div className="section-head"><h3>Klart</h3><span className="meta">{kr(sum(items.filter((i) => i.done)))}</span></div>
        <ItemList items={items.filter((i) => i.done).sort(byDate)} state={state} open={open} empty="Inget klart än" hideRoom />
      </div>
      <RoomPhotos state={state} roomId={room.id} />
      <RoomEditSheet room={editing ? room : null} state={state} onClose={() => setEditing(false)} onDeleted={() => { setEditing(false); onClose() }} />
    </>
  )
}
