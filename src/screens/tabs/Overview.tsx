import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { kr } from '../../lib/format'
import { needsInfo, totals, useBudget } from '../../lib/useProject'
import { BudgetMeter } from '../../components/BudgetMeter'
import { FileThumb } from '../../components/FileField'
import { FloorPlan } from '../../components/FloorPlan'
import { ICONS, iconFor } from '../../components/icons'
import { Chips, Field, Primary, Sheet, ease } from '../../components/ui'
import { PALETTE, ROOM_PRESETS, tileStyle, type IconKey, type Palette, type Room } from '../../types'
import type { ProjectState, ViewProps } from '../ProjectView'
import { ItemList, ItemRow, allItems, byImportance, sheetFor, useMarkDone } from './Items'
import { COLOR_LABEL, FolderTiles } from './Folders'

export function Overview({ state, open, openFolder }: ViewProps & { openFolder: (id: string) => void }) {
  const { project, rooms, purchases, tasks, folders } = state
  const b = useBudget(project, purchases, tasks)
  const simple = project?.mode === 'simple'
  const { markDone, field } = useMarkDone(state)

  // Det viktigaste som är kvar att göra.
  const todo = allItems(state).filter((i) => !i.done).sort(byImportance).slice(0, 5)

  const isEmpty = !purchases.length && !tasks.length && !folders.length
  const unfinished = purchases.filter(needsInfo)

  return (
    <div>
      {field}
      <div className="section">
        <div className="section-head"><h1>Översikt</h1></div>
        <BudgetMeter budget={b.budget} spent={b.spent} planned={b.planned} />
      </div>

      {unfinished.length > 0 && (
        <div className="section">
          <div className="section-head">
            <h2>Kvitton att fylla i</h2>
            <span className="meta">{unfinished.length} st</span>
          </div>
          <div className="rows">
            {unfinished.slice(0, 4).map((p) => (
              <div key={p.id} className="row" onClick={() => open({ t: 'purchase', item: p })}>
                <div className="row__main">
                  {p.receipt_path && <FileThumb path={p.receipt_path} url={state.urls[p.receipt_path]} />}
                  <div className="row__text">
                    <div className="row__title">{p.title}</div>
                    <span className="status status--warning">Belopp saknas</span>
                  </div>
                </div>
                <span className="btn btn--ghost">Fyll i</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="section">
        <FloorPlan state={state} onRoom={(room) => open({ t: 'roomInfo', room })} onAddRoom={() => open({ t: 'room' })} />
      </div>

      {isEmpty && (
        <div className="section">
          <div className="section-head"><h2>Kom igång</h2></div>
          <div className="rows">
            <div className="row" onClick={() => open({ t: 'receipt' })}><div className="row__text"><div className="row__title">Spara ett kvitto</div><div className="meta">Fota kvittot från något du köpt</div></div></div>
            {!simple && <div className="row" onClick={() => open({ t: 'folder' })}><div className="row__text"><div className="row__title">Skapa en mapp</div><div className="meta">Till exempel Köksrenovering eller Möbler</div></div></div>}
            <div className="row" onClick={() => open({ t: 'purchase', item: {} })}><div className="row__text"><div className="row__title">Skriv upp något att göra</div><div className="meta">Något du ska köpa eller fixa</div></div></div>
          </div>
        </div>
      )}

      {todo.length > 0 && (
        <div className="section">
          <div className="section-head"><h2>Att göra först</h2></div>
          <div className="rows">
            {todo.map((it) => <ItemRow key={it.id} it={it} state={state} showFolder onCheck={markDone} onEdit={() => open(sheetFor(it))} />)}
          </div>
        </div>
      )}

      {!simple && folders.length > 0 && (
        <div className="section">
          <div className="section-head"><h2>Mappar</h2></div>
          <FolderTiles state={state} onOpen={openFolder} />
        </div>
      )}

      {/* Med en planritning är det den som visar rummen; rutorna behövs bara utan ritning. */}
      {!project?.floorplan_path && (
      <div className="section">
        <div className="section-head">
          <h2>Rum</h2>
          <button className="btn btn--ghost" onClick={() => open({ t: 'room' })}>Lägg till rum</button>
        </div>
        <div className="tiles">
          {rooms.map((r, i) => {
            const s = totals(purchases.filter((p) => p.room_id === r.id), tasks.filter((t) => t.room_id === r.id))
            const Icon = iconFor(r.icon)
            return (
              <motion.button key={r.id} className="tile" style={tileStyle(r.color ?? PALETTE[i % PALETTE.length])} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: i * 0.03, ease }} onClick={() => open({ t: 'roomInfo', room: r })}>
                <div className="tile__name">{r.name}</div>
                <div className="tile__meta">{s.items ? `${s.done} av ${s.items} klart` : 'Inget planerat'}</div>
                {s.spent > 0 && <div className="tile__meta">{kr(s.spent)}</div>}
                <Icon className="tile__icon" />
              </motion.button>
            )
          })}
        </div>
      </div>
      )}
    </div>
  )
}

// Allt som hör till ett rum, när man trycker på det i planritningen eller bland rutorna.
export function RoomSheet({ room, state, open, onClose }: { room: Room | null; state: ProjectState; open: ViewProps['open']; onClose: () => void }) {
  const rp = room ? state.purchases.filter((p) => p.room_id === room.id) : []
  const rt = room ? state.tasks.filter((t) => t.room_id === room.id) : []
  const ri = room ? state.ideas.filter((i) => i.room_id === room.id) : []
  const items = allItems({ purchases: rp, tasks: rt })
  const { markDone, field } = useMarkDone(state)
  const s = totals(rp, rt)
  const [rename, setRename] = useState<{ name: string; color: Palette } | null>(null)
  useEffect(() => setRename(null), [room?.id])

  const saveRename = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!room || !rename?.name.trim()) return
    await api.update('rooms', room.id, { name: rename.name.trim(), color: rename.color })
    await state.reload()
    setRename(null)
    onClose()
  }

  return (
    <Sheet open={!!room} onClose={onClose} title={room?.name ?? ''}>
      {room && rename && (
        <form className="form section" onSubmit={saveRename}>
          <Field label="Namn">
            <input className="input" value={rename.name} onChange={(e) => setRename({ ...rename, name: e.target.value })} required />
          </Field>
          <div className="field">
            <span className="field__label">Färg</span>
            <Chips value={rename.color} onChange={(c) => setRename({ ...rename, color: c })} options={PALETTE.map((c) => ({ value: c, label: COLOR_LABEL[c] }))} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn--secondary">Spara</button>
            <button type="button" className="btn btn--ghost" onClick={() => setRename(null)}>Avbryt</button>
          </div>
        </form>
      )}
      {room && !rename && (
        <div>
          <button className="btn btn--ghost" style={{ marginLeft: -16, marginTop: -8, marginBottom: 8 }} onClick={() => setRename({ name: room.name, color: room.color })}>Byt namn eller färg</button>
          <div className="kpis section">
            <div className="kpi"><div className="meta">Spenderat</div><div className="kpi__value">{kr(s.spent)}</div></div>
            <div className="kpi"><div className="meta">Planerat</div><div className="kpi__value">{kr(s.planned)}</div></div>
          </div>

          {field}
          <div className="section">
            <div className="section-head">
              <h2>Att göra</h2>
              <button className="btn btn--ghost" onClick={() => open({ t: 'purchase', item: { room_id: room.id } })}>Lägg till</button>
            </div>
            <ItemList items={items.filter((i) => !i.done).sort(byImportance)} state={state} open={open} onCheck={markDone} empty="Inget att göra" />
          </div>

          <div className="section">
            <div className="section-head">
              <h2>Gjort</h2>
              <button className="btn btn--ghost" onClick={() => open({ t: 'purchase', item: { room_id: room.id, bought: true } })}>Lägg till</button>
            </div>
            <ItemList items={items.filter((i) => i.done).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))} state={state} open={open} empty="Inget gjort än" />
          </div>

          {ri.length > 0 && (
            <div className="section">
              <div className="section-head"><h2>Idéer</h2></div>
              <div className="rows">
                {ri.map((i) => (
                  <div key={i.id} className="row" onClick={() => open({ t: 'idea', item: i })}><div className="row__title">{i.title}</div></div>
                ))}
              </div>
            </div>
          )}

          <button className="btn btn--danger" onClick={async () => {
            if (!confirm(`Ta bort rummet ${room.name}? Det som ligger i rummet finns kvar, utan rum.`)) return
            await api.remove('rooms', room.id)
            await state.reload()
            onClose()
          }}>Ta bort rum</button>
        </div>
      )}
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
