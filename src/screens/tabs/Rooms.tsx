import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { IconArrowLeft, IconChevronRight, IconHome } from '@tabler/icons-react'
import { api } from '../../lib/api'
import { kr } from '../../lib/format'
import { FloorPlan } from '../../components/FloorPlan'
import { ICONS, iconFor } from '../../components/icons'
import { Chips, Field, Primary, Sheet, ease } from '../../components/ui'
import { PALETTE, ROOM_PRESETS, tileStyle, type IconKey, type Palette, type Room } from '../../types'
import type { ProjectState, ViewProps } from '../ProjectView'
import { COLOR_LABEL } from './Folders'
import { IdeaRows } from './Ideas'
import { ItemList, allItems, byImportance, useMarkDone } from './Items'
import { RoomPhotos } from './Photos'

// Det som inte hör till något särskilt rum samlas under "Hela hemmet".
export const HOME = 'home'

const stats = (state: ProjectState, roomId: string | null) => {
  const items = allItems(state).filter((i) => i.room_id === roomId)
  return { todo: items.filter((i) => !i.done).length, spent: items.filter((i) => i.done).reduce((s, i) => s + i.amount, 0) }
}
const summary = (s: { todo: number; spent: number }) => [s.todo ? `${s.todo} att göra` : null, s.spent ? kr(s.spent) : null].filter(Boolean).join(' · ')

// Rum: planritningen (eller rutor utan ritning). Trycker man på ett rum öppnas allt om det.
export function Rooms({ state, open, place, setPlace }: ViewProps & { place: string | null; setPlace: (id: string | null) => void }) {
  const [editing, setEditing] = useState<Room | null>(null)
  const room = state.rooms.find((r) => r.id === place)
  if (place === HOME || room) {
    return (
      <>
        <RoomDetail state={state} open={open} room={room ?? null} onBack={() => setPlace(null)} onEdit={() => room && setEditing(room)} />
        <RoomEditSheet room={editing} state={state} onClose={() => setEditing(null)} onDeleted={() => { setEditing(null); setPlace(null) }} />
      </>
    )
  }

  const home = stats(state, null)
  const plan = <FloorPlan state={state} onRoom={(r) => setPlace(r.id)} onAddRoom={() => open({ t: 'room' })} />
  return (
    <div>
      <div className="section-head">
        <h1>Rum</h1>
        <button className="btn btn--ghost" onClick={() => open({ t: 'room' })}>Lägg till rum</button>
      </div>

      {state.project?.floorplan_path ? (
        <>
          <div className="section">{plan}</div>
          <div className="rows section">
            <div className="row" onClick={() => setPlace(HOME)}>
              <div className="row__main">
                <span className="menu-row__icon"><IconHome size={18} /></span>
                <div className="row__text"><div className="row__title">Hela hemmet</div><div className="meta">{summary(home) || 'Det som inte hör till ett rum'}</div></div>
              </div>
              <IconChevronRight size={18} />
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="tiles section">
            {state.rooms.map((r, i) => {
              const Icon = iconFor(r.icon)
              return (
                <motion.button key={r.id} className="tile" style={tileStyle(r.color ?? PALETTE[i % PALETTE.length])} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: i * 0.03, ease }} onClick={() => setPlace(r.id)}>
                  <div className="tile__name">{r.name}</div>
                  <div className="tile__meta">{summary(stats(state, r.id)) || 'Inget än'}</div>
                  <Icon className="tile__icon" />
                </motion.button>
              )
            })}
            <button className="tile" style={tileStyle('steel')} onClick={() => setPlace(HOME)}>
              <div className="tile__name">Hela hemmet</div>
              <div className="tile__meta">{summary(home) || 'Inget än'}</div>
              <IconHome className="tile__icon" />
            </button>
          </div>
          <div className="section">{plan}</div>
        </>
      )}
    </div>
  )
}

function RoomDetail({ state, open, room, onBack, onEdit }: { state: ProjectState; open: ViewProps['open']; room: Room | null; onBack: () => void; onEdit: () => void }) {
  const id = room?.id ?? null
  const items = allItems(state).filter((i) => i.room_id === id)
  const ideas = state.ideas.filter((i) => i.room_id === id)
  const { markDone, field } = useMarkDone(state)
  const s = stats(state, id)

  return (
    <div>
      {field}
      <button className="btn btn--ghost" style={{ marginLeft: -16, marginBottom: 8 }} onClick={onBack}><IconArrowLeft size={16} /> Rum</button>
      <div className="section-head">
        <h1>{room?.name ?? 'Hela hemmet'}</h1>
        {room && <button className="btn btn--secondary" onClick={onEdit}>Ändra</button>}
      </div>
      {s.spent > 0 && <p className="meta">{kr(s.spent)} spenderat</p>}

      <div className="section">
        <div className="section-head">
          <h2>Att göra</h2>
          <button className="btn btn--ghost" onClick={() => open({ t: 'purchase', item: { room_id: id } })}>Lägg till</button>
        </div>
        <ItemList items={items.filter((i) => !i.done).sort(byImportance)} state={state} open={open} onCheck={markDone} empty="Inget att göra" hideRoom />
      </div>

      <div className="section">
        <div className="section-head">
          <h2>Gjort</h2>
          <button className="btn btn--ghost" onClick={() => open({ t: 'purchase', item: { room_id: id, bought: true } })}>Lägg till</button>
        </div>
        <ItemList items={items.filter((i) => i.done).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))} state={state} open={open} empty="Inget gjort än" hideRoom />
      </div>

      <RoomPhotos state={state} roomId={id} onAdd={() => open({ t: 'pick', room_id: id })} />

      <div className="section">
        <div className="section-head">
          <h2>Idéer</h2>
          <button className="btn btn--ghost" onClick={() => open({ t: 'idea', item: { room_id: id } })}>Lägg till</button>
        </div>
        {ideas.length ? <IdeaRows state={state} ideas={[...ideas].reverse()} open={open} /> : <p className="meta">Inga idéer</p>}
      </div>
    </div>
  )
}

function RoomEditSheet({ room, state, onClose, onDeleted }: { room: Room | null; state: ProjectState; onClose: () => void; onDeleted: () => void }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState<Palette>('lilac')
  useEffect(() => {
    if (room) {
      setName(room.name)
      setColor(room.color)
    }
  }, [room])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!room || !name.trim()) return
    await api.update('rooms', room.id, { name: name.trim(), color })
    await state.reload()
    onClose()
  }

  const del = async () => {
    if (!room || !confirm(`Ta bort rummet ${room.name}? Det som ligger i rummet finns kvar, under Hela hemmet.`)) return
    await api.remove('rooms', room.id)
    await state.reload()
    onDeleted()
  }

  return (
    <Sheet open={!!room} onClose={onClose} title={room?.name ?? ''}>
      <form className="form" onSubmit={save}>
        <Field label="Namn">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <div className="field">
          <span className="field__label">Färg</span>
          <Chips value={color} onChange={setColor} options={PALETTE.map((c) => ({ value: c, label: COLOR_LABEL[c] }))} />
        </div>
        <div className="form__actions">
          <Primary>Spara</Primary>
          <button type="button" className="btn btn--danger" onClick={del}>Ta bort rum</button>
        </div>
      </form>
    </Sheet>
  )
}

const ICON_CHOICES = Object.keys(ICONS) as IconKey[]

export function AddRoomSheet({ open, onClose, state }: { open: boolean; onClose: () => void; state: ProjectState }) {
  const [name, setName] = useState('')
  const [icon, setIcon] = useState<IconKey>('home')
  const [color, setColor] = useState<Palette>('lilac')
  const existing = new Set(state.rooms.map((r) => r.name))

  const add = async (n: string, i: IconKey, c: Palette) => {
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
              const Icon = ICONS[k]
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
