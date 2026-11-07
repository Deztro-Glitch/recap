import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { IconFileText, IconX } from '@tabler/icons-react'
import { api } from '../../lib/api'
import { daysLeft, kr } from '../../lib/format'
import { FloorPlan } from '../../components/FloorPlan'
import { iconFor } from '../../components/icons'
import { Chips, ease } from '../../components/ui'
import { CONDITION_LABEL, CONTRACT_KIND_LABEL, MODE_LABEL, PALETTE, modeScope, tileStyle, type Condition, type Mode, type Room } from '../../types'
import type { ProjectState, ViewProps } from '../ProjectView'
import { ContractStatus } from './Contracts'
import { ItemList, allItems, byDate, byImportance, modeItems, roomFacts, sheetFor, sum, useMarkDone, type Item } from './Items'
import { RoomPhotos } from './Photos'
import { RoomEditSheet } from './Rooms'
import { EconomyDashboard } from './Economy'
import { GlassCard } from '../../components/GlassCard'
import { Counter } from '../../components/Counter'

// Översikt: nyckeltal, planritningen och en panel som visar hemmet eller det rum man tryckt på.
export function Overview({ state, open, place, setPlace }: ViewProps & { place: string | null; setPlace: (id: string | null) => void }) {
  const project = state.project!
  const mode: Mode = project.mode ?? 'full'
  // Nyckeltalen i Projekt och listorna i panelen gäller bara det som hör till läget.
  const items = modeItems(state)
  const room = state.rooms.find((r) => r.id === place) ?? null
  const panel = useRef<HTMLDivElement>(null)

  // På mobilen ligger panelen under ritningen, så den rullas fram när man väljer ett rum.
  useEffect(() => {
    if (room && matchMedia('(max-width: 1024px)').matches) panel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [room?.id])

  const setMode = async (m: Mode) => {
    await api.updateProject(project.id, { mode: m })
    await state.reload()
  }

  // I Boende visas ekonomin i stället, se EconomyDashboard.
  const kpis = [
    { label: 'Spenderat', value: sum(items.filter((i) => i.done)) },
    { label: 'Planerat', value: sum(items.filter((i) => !i.done)) },
  ]

  return (
    <div>
      <div className="section-head">
        <h1>Översikt</h1>
        <Chips value={mode} onChange={setMode} options={(['full', 'simple'] as Mode[]).map((m) => ({ value: m, label: MODE_LABEL[m] }))} />
      </div>

      {mode === 'simple' ? (
        <EconomyDashboard state={state} open={open} />
      ) : (
        <div className="kpis">
          {kpis.map((k) => (
            <GlassCard key={k.label} className="kpi"><div className="meta">{k.label}</div><div className="kpi__value"><Counter value={k.value} /></div></GlassCard>
          ))}
        </div>
      )}

      <div className="overview section">
        <div>
          {!project.floorplan_path && state.rooms.length > 0 && (
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
          )}
          <GlassCard className="plan-card" lift={false}>
            <FloorPlan state={state} onRoom={(r) => setPlace(r.id === place ? null : r.id)} onAddRoom={() => open({ t: 'room' })} />
          </GlassCard>
        </div>

        <aside className="panel glass" ref={panel}>
          {room ? <RoomPanel state={state} open={open} room={room} onClose={() => setPlace(null)} /> : <HomePanel state={state} open={open} items={items} />}
        </aside>
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
      <div className="field" style={{ marginBottom: 'var(--s-3)' }}>
        <span className="field__label">Skick</span>
        <Chips value={(room.condition ?? 2) as Condition} onChange={(c) => state.patch('rooms', room.id, { condition: c })}
          options={([1, 2, 3] as Condition[]).map((c) => ({ value: c, label: CONDITION_LABEL[c] }))} />
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
          <button className="btn btn--ghost" onClick={() => open({ t: 'purchase', item: { room_id: room.id, scope: modeScope(state.project?.mode) } })}>Lägg till</button>
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
