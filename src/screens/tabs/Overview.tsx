import { motion } from 'framer-motion'
import { useState } from 'react'
import { api } from '../../lib/api'
import { kr } from '../../lib/format'
import { useBudget } from '../../lib/useProject'
import { BudgetMeter } from '../../components/BudgetMeter'
import { ROOM_ICONS, roomIcon } from '../../components/icons'
import { Chips, Field, Primary, Sheet, ease } from '../../components/ui'
import { PALETTE, PHASES, ROOM_PRESETS, tileStyle, type Palette, type RoomIcon } from '../../types'
import type { ViewProps } from '../ProjectView'
import { TaskStatusLabel } from './Timeline'

export function Overview({ state, q, adding, setAdding, onOpenRoom, onShowPhase }: ViewProps & { onOpenRoom: (id: string) => void; onShowPhase: (p: number) => void }) {
  const { project, rooms, purchases, tasks } = state
  const b = useBudget(project, purchases, tasks)
  const match = (s: string) => s.toLowerCase().includes(q.toLowerCase())
  const next = tasks.filter((t) => t.status !== 'done' && match(t.title)).sort((a, b) => a.phase - b.phase).slice(0, 4)
  const roomName = (id: string | null) => rooms.find((r) => r.id === id)?.name

  return (
    <div>
      <div className="section">
        <div className="section-head"><h1>Översikt</h1></div>
        <BudgetMeter budget={b.budget} spent={b.spent} planned={b.planned} />
      </div>

      <div className="section">
        <div className="section-head"><h2>Rum</h2></div>
        <div className="tiles">
          {rooms.filter((r) => match(r.name)).map((r, i) => {
            const rp = purchases.filter((p) => p.room_id === r.id)
            const rt = tasks.filter((t) => t.room_id === r.id)
            const total = rp.length + rt.length
            const done = rp.filter((p) => p.bought).length + rt.filter((t) => t.status === 'done').length
            const spent = rp.filter((p) => p.bought).reduce((s, p) => s + (p.price ?? p.est_price), 0) + rt.filter((t) => t.status === 'done').reduce((s, t) => s + t.cost, 0)
            const Icon = roomIcon(r.icon)
            return (
              <motion.button
                key={r.id}
                className="tile"
                style={tileStyle(r.color ?? PALETTE[i % PALETTE.length])}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: i * 0.03, ease }}
                onClick={() => onOpenRoom(r.id)}
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

      {next.length > 0 && (
        <div className="section">
          <div className="section-head"><h2>Nästa jobb</h2></div>
          <div className="rows">
            {next.map((t) => (
              <div key={t.id} className="row" onClick={() => onShowPhase(t.phase)}>
                <div className="row__text">
                  <div className="row__title">{t.title}</div>
                  <div className="meta">{[PHASES[t.phase]?.name, roomName(t.room_id)].filter(Boolean).join(' · ')}</div>
                </div>
                <TaskStatusLabel status={t.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      <AddRoomSheet open={adding} onClose={() => setAdding(false)} state={state} />
    </div>
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
