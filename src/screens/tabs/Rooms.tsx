import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { ICONS } from '../../components/icons'
import { Chips, Field, Primary, Sheet } from '../../components/ui'
import { COLOR_LABEL, PALETTE, ROOM_PRESETS, type IconKey, type Palette, type Room } from '../../types'
import type { ProjectState } from '../ProjectView'

// Byta namn och färg på ett rum, eller ta bort det.
export function RoomEditSheet({ room, state, onClose, onDeleted }: { room: Room | null; state: ProjectState; onClose: () => void; onDeleted: () => void }) {
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
    if (!room || !confirm(`Ta bort rummet ${room.name}? Det som ligger i rummet finns kvar, utan rum.`)) return
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
