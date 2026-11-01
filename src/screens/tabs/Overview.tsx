import { motion } from 'framer-motion'
import { useState } from 'react'
import { api } from '../../lib/api'
import { kr } from '../../lib/format'
import { paid, useBudget } from '../../lib/useProject'
import { BudgetMeter } from '../../components/BudgetMeter'
import { FloorPlan } from '../../components/FloorPlan'
import { ROOM_ICONS, roomIcon } from '../../components/icons'
import { Chips, Field, Primary, Sheet, ease } from '../../components/ui'
import { PALETTE, PHASES, ROOM_PRESETS, tileStyle, type Palette, type Room, type RoomIcon } from '../../types'
import type { ViewProps } from '../ProjectView'
import { PriorityTag, PurchaseRow, today } from './Purchases'
import { TaskStatusLabel } from './Timeline'

type Go = (view: 'purchases' | 'timeline' | 'receipts' | 'ideas' | 'photos', room: string | null) => void

export function Overview({ state, q, adding, setAdding, onGo, onShowPhase }: ViewProps & { onGo: Go; onShowPhase: (p: number) => void }) {
  const { project, rooms, purchases, tasks } = state
  const b = useBudget(project, purchases, tasks)
  const [openRoom, setOpenRoom] = useState<Room | null>(null)
  const match = (s: string) => s.toLowerCase().includes(q.toLowerCase())
  const roomName = (id: string | null) => rooms.find((r) => r.id === id)?.name

  // Det viktigaste som är kvar: hög prio först, sedan jobb i fasordning.
  const todo = [
    ...purchases.filter((p) => !p.bought && match(p.title)).map((p) => ({ id: p.id, title: p.title, priority: p.priority ?? 2, order: 99, meta: ['Inköp', roomName(p.room_id)], right: kr(p.est_price), onClick: () => onGo('purchases', p.room_id) })),
    ...tasks.filter((t) => t.status !== 'done' && match(t.title)).map((t) => ({ id: t.id, title: t.title, priority: t.priority ?? 2, order: t.phase, meta: [PHASES[t.phase]?.name, roomName(t.room_id)], right: <TaskStatusLabel status={t.status} />, onClick: () => onShowPhase(t.phase) })),
  ].sort((a, b) => a.priority - b.priority || a.order - b.order).slice(0, 5)

  return (
    <div>
      <div className="section">
        <div className="section-head"><h1>Översikt</h1></div>
        <BudgetMeter budget={b.budget} spent={b.spent} planned={b.planned} stays={b.stays} mine={b.mine} />
      </div>

      <div className="section">
        <FloorPlan state={state} onRoom={setOpenRoom} />
      </div>

      <div className="section">
        <div className="section-head"><h2>Rum</h2></div>
        <div className="tiles">
          {rooms.filter((r) => match(r.name)).map((r, i) => {
            const rp = purchases.filter((p) => p.room_id === r.id)
            const rt = tasks.filter((t) => t.room_id === r.id)
            const total = rp.length + rt.length
            const done = rp.filter((p) => p.bought).length + rt.filter((t) => t.status === 'done').length
            const spent = rp.filter((p) => p.bought).reduce((s, p) => s + paid(p), 0) + rt.filter((t) => t.status === 'done').reduce((s, t) => s + t.cost, 0)
            const Icon = roomIcon(r.icon)
            return (
              <motion.button
                key={r.id}
                className="tile"
                style={tileStyle(r.color ?? PALETTE[i % PALETTE.length])}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: i * 0.03, ease }}
                onClick={() => setOpenRoom(r)}
              >
                <div className="tile__name">{r.name}</div>
                <div className="tile__meta">{total ? `${done} av ${total} klart` : 'Inget planerat'}</div>
                {spent > 0 && <div className="tile__meta">{kr(spent)}</div>}
                <Icon className="tile__icon" />
              </motion.button>
            )
          })}
        </div>
      </div>

      {todo.length > 0 && (
        <div className="section">
          <div className="section-head"><h2>Att göra först</h2></div>
          <div className="rows">
            {todo.map((t) => (
              <div key={t.id} className="row" onClick={t.onClick}>
                <div className="row__text">
                  <div className="row__title">{t.title}</div>
                  <div className="meta">{t.meta.filter(Boolean).join(' · ')}</div>
                  <PriorityTag priority={t.priority} />
                </div>
                <span className="row__amount">{t.right}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <RoomSheet room={openRoom} state={state} onClose={() => setOpenRoom(null)} onGo={(v, id) => { setOpenRoom(null); onGo(v, id) }} />
      <AddRoomSheet open={adding} onClose={() => setAdding(false)} state={state} />
    </div>
  )
}

// Allt som hör till ett rum, när man trycker på det i planritningen eller bland rutorna.
function RoomSheet({ room, state, onClose, onGo }: { room: Room | null; state: ViewProps['state']; onClose: () => void; onGo: Go }) {
  const rp = room ? state.purchases.filter((p) => p.room_id === room.id) : []
  const rt = room ? state.tasks.filter((t) => t.room_id === room.id) : []
  const ri = room ? state.ideas.filter((i) => i.room_id === room.id) : []
  const spent = rp.filter((p) => p.bought).reduce((s, p) => s + paid(p), 0) + rt.filter((t) => t.status === 'done').reduce((s, t) => s + t.cost, 0)
  const planned = rp.reduce((s, p) => s + (p.bought ? paid(p) : p.est_price), 0) + rt.reduce((s, t) => s + t.cost, 0)

  return (
    <Sheet open={!!room} onClose={onClose} title={room?.name ?? ''}>
      {room && (
        <div>
          <div className="kpis section">
            <div className="kpi"><div className="meta">Spenderat</div><div className="kpi__value">{kr(spent)}</div></div>
            <div className="kpi"><div className="meta">Planerat</div><div className="kpi__value">{kr(planned)}</div></div>
          </div>

          <div className="section">
            <div className="section-head">
              <h2>Inköp</h2>
              <button className="btn btn--ghost" onClick={() => onGo('purchases', room.id)}>Visa alla</button>
            </div>
            {rp.length ? (
              <div className="rows">
                {rp.map((p) => (
                  <PurchaseRow
                    key={p.id}
                    p={p}
                    room={room}
                    onToggle={(on) => state.patch('purchases', p.id, { bought: on, price: on ? p.price ?? p.est_price : p.price, bought_on: on ? p.bought_on ?? today() : p.bought_on })}
                    onEdit={() => onGo('purchases', room.id)}
                  />
                ))}
              </div>
            ) : (
              <p className="meta">Inga inköp</p>
            )}
          </div>

          <div className="section">
            <div className="section-head">
              <h2>Jobb</h2>
              <button className="btn btn--ghost" onClick={() => onGo('timeline', room.id)}>Visa alla</button>
            </div>
            {rt.length ? (
              <div className="rows">
                {rt.map((t) => (
                  <div key={t.id} className={`row ${t.status === 'done' ? 'is-done' : ''}`} onClick={() => onGo('timeline', room.id)}>
                    <div className="row__text">
                      <div className="row__title">{t.title}</div>
                      <div className="meta">{[PHASES[t.phase]?.name, t.cost ? kr(t.cost) : null].filter(Boolean).join(' · ')}</div>
                    </div>
                    <TaskStatusLabel status={t.status} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="meta">Inga jobb</p>
            )}
          </div>

          {ri.length > 0 && (
            <div className="section">
              <div className="section-head">
                <h2>Idéer</h2>
                <button className="btn btn--ghost" onClick={() => onGo('ideas', room.id)}>Visa alla</button>
              </div>
              <div className="rows">
                {ri.map((i) => (
                  <div key={i.id} className="row" onClick={() => onGo('ideas', room.id)}>
                    <div className="row__title">{i.title}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Sheet>
  )
}

const ICON_CHOICES = Object.keys(ROOM_ICONS) as RoomIcon[]

function AddRoomSheet({ open, onClose, state }: { open: boolean; onClose: () => void; state: ViewProps['state'] }) {
  const [name, setName] = useState('')
  const [icon, setIcon] = useState<RoomIcon>('home')
  const [color, setColor] = useState<Palette>('lilac')
  const existing = new Set(state.rooms.map((r) => r.name))

  const add = async (n: string, i: RoomIcon, c: Palette) => {
    await api.insert('rooms', { project_id: state.project!.id, name: n, icon: i, color: c, sort: state.rooms.length })
    await state.reload()
    setName('')
    onClose()
  }

  const presets = ROOM_PRESETS.filter((r) => !existing.has(r.name))

  return (
    <Sheet open={open} onClose={onClose} title="Lägg till rum">
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) add(name.trim(), icon, color)
        }}
      >
        {presets.length > 0 && (
          <div className="field">
            <span className="field__label">Vanliga rum</span>
            <div className="chips">
              {presets.map((r) => (
                <button type="button" key={r.name} className="chip" onClick={() => add(r.name, r.icon, r.color)}>{r.name}</button>
              ))}
            </div>
          </div>
        )}
        <Field label="Eget rum">
          <input className="input" placeholder="Klädkammare" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="field">
          <span className="field__label">Ikon</span>
          <div className="chips">
            {ICON_CHOICES.map((k) => {
              const Icon = ROOM_ICONS[k]
              return (
                <button type="button" key={k} className={`chip ${icon === k ? 'is-active' : ''}`} onClick={() => setIcon(k)} aria-label={k}>
                  <Icon size={16} />
                </button>
              )
            })}
          </div>
        </div>
        <div className="field">
          <span className="field__label">Färg</span>
          <Chips value={color} onChange={setColor} options={PALETTE.map((c) => ({ value: c, label: COLOR_LABEL[c] }))} />
        </div>
        <div className="form__actions">
          <Primary disabled={!name.trim()}>Lägg till rum</Primary>
        </div>
      </form>
    </Sheet>
  )
}

const COLOR_LABEL: Record<Palette, string> = { sand: 'Sand', coral: 'Korall', steel: 'Stål', sun: 'Sol', mint: 'Mint', sky: 'Himmel', lilac: 'Syren', rose: 'Ros' }
