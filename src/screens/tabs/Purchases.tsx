import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState, type ReactNode } from 'react'
import { IconExternalLink } from '@tabler/icons-react'
import { api } from '../../lib/api'
import { kr, parseNum } from '../../lib/format'
import { Checkbox, Field, Primary, Sheet, rowAnim, useToast } from '../../components/ui'
import type { Purchase, Room } from '../../types'
import type { ViewProps } from '../ProjectView'

export function Purchases({ state, room, q, adding, setAdding, filter }: ViewProps & { filter: ReactNode }) {
  const [editing, setEditing] = useState<Purchase | null>(null)
  const list = state.purchases.filter((p) => (room === null || p.room_id === room) && p.title.toLowerCase().includes(q.toLowerCase()))
  const toBuy = list.filter((p) => !p.bought)
  const bought = list.filter((p) => p.bought)
  const roomOf = (id: string | null) => state.rooms.find((r) => r.id === id)

  const toggle = (p: Purchase, on: boolean) => state.patch('purchases', p.id, { bought: on, price: on ? p.price ?? p.est_price : p.price })

  return (
    <div>
      <div className="section-head">
        <h1>Inköp</h1>
        {filter}
      </div>

      {list.length === 0 ? (
        <div className="empty">
          <h2>{q || room ? 'Inga inköp här' : 'Inga inköp än'}</h2>
          <button className="btn btn--secondary" onClick={() => setAdding(true)}>Lägg till inköp</button>
        </div>
      ) : (
        <>
          {toBuy.length > 0 && (
            <Group title="Att köpa" total={toBuy.reduce((s, p) => s + p.est_price, 0)}>
              {toBuy.map((p) => <Row key={p.id} p={p} room={roomOf(p.room_id)} onToggle={(on) => toggle(p, on)} onEdit={() => setEditing(p)} />)}
            </Group>
          )}
          {bought.length > 0 && (
            <Group title="Köpt" total={bought.reduce((s, p) => s + (p.price ?? p.est_price), 0)}>
              {bought.map((p) => <Row key={p.id} p={p} room={roomOf(p.room_id)} onToggle={(on) => toggle(p, on)} onEdit={() => setEditing(p)} />)}
            </Group>
          )}
        </>
      )}

      <PurchaseSheet
        item={editing ?? (adding ? 'new' : null)}
        defaultRoom={room}
        rooms={state.rooms}
        state={state}
        onClose={() => {
          setEditing(null)
          setAdding(false)
        }}
      />
    </div>
  )
}

function Group({ title, total, children }: { title: string; total: number; children: ReactNode }) {
  return (
    <div className="section">
      <div className="section-head">
        <h2>{title}</h2>
        <span className="row__amount">{kr(total)}</span>
      </div>
      <div className="rows">
        <AnimatePresence initial={false}>{children}</AnimatePresence>
      </div>
    </div>
  )
}

function Row({ p, room, onToggle, onEdit }: { p: Purchase; room?: Room; onToggle: (on: boolean) => void; onEdit: () => void }) {
  return (
    <motion.div layout="position" {...rowAnim} className={`row ${p.bought ? 'is-done' : ''}`} onClick={onEdit}>
      <div className="row__main">
        <Checkbox checked={p.bought} onChange={onToggle} label={p.bought ? `Markera ${p.title} som ej köpt` : `Markera ${p.title} som köpt`} />
        {room && <span className="row__swatch" style={{ background: `var(--c-${room.color}-bg)` }} />}
        <div className="row__text">
          <div className="row__title">{p.title}</div>
          <div className="meta">{[room?.name, p.store].filter(Boolean).join(' · ') || 'Inget rum'}</div>
        </div>
      </div>
      {p.link && (
        <a href={p.link} target="_blank" rel="noreferrer" className="row__link" aria-label="Öppna produktlänk" onClick={(e) => e.stopPropagation()}>
          <IconExternalLink size={16} />
        </a>
      )}
      <span className="row__amount">{kr(p.bought ? p.price ?? p.est_price : p.est_price)}</span>
    </motion.div>
  )
}

function PurchaseSheet({ item, defaultRoom, rooms, state, onClose }: { item: Purchase | 'new' | null; defaultRoom: string | null; rooms: Room[]; state: ViewProps['state']; onClose: () => void }) {
  const toast = useToast()
  const isNew = item === 'new'
  const p = item && item !== 'new' ? item : null
  const [f, setF] = useState({ title: '', room_id: '', est: '', price: '', store: '', link: '', note: '', bought: false })

  useEffect(() => {
    if (!item) return
    setF({
      title: p?.title ?? '',
      room_id: p ? p.room_id ?? '' : defaultRoom ?? '',
      est: p?.est_price ? String(p.est_price) : '',
      price: p?.price != null ? String(p.price) : '',
      store: p?.store ?? '',
      link: p?.link ?? '',
      note: p?.note ?? '',
      bought: p?.bought ?? false,
    })
  }, [item])

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const row = {
      title: f.title.trim(),
      room_id: f.room_id || null,
      est_price: parseNum(f.est),
      price: f.price.trim() ? parseNum(f.price) : null,
      store: f.store.trim() || null,
      link: f.link.trim() || null,
      note: f.note.trim() || null,
      bought: f.bought,
    }
    try {
      if (isNew) await api.insert('purchases', { ...row, project_id: state.project!.id })
      else await api.update('purchases', p!.id, row)
      await state.reload()
      toast(isNew ? `${row.title} är tillagd` : 'Ändringarna är sparade')
      onClose()
    } catch (err: any) {
      toast({ title: 'Inköpet kunde inte sparas', body: err.message })
    }
  }

  const del = async () => {
    await api.remove('purchases', p!.id)
    await state.reload()
    toast(`${p!.title} är borttagen`)
    onClose()
  }

  return (
    <Sheet open={!!item} onClose={onClose} title={isNew ? 'Nytt inköp' : p?.title ?? ''}>
      <form className="form" onSubmit={save}>
        <Field label="Vad">
          <input className="input" placeholder="Soffa Söderhamn" value={f.title} onChange={set('title')} required />
        </Field>
        <Field label="Rum">
          <select className="select" value={f.room_id} onChange={set('room_id')}>
            <option value="">Inget rum</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
        <div className="form__row">
          <Field label="Uppskattat pris">
            <input className="input" inputMode="decimal" placeholder="12 995" value={f.est} onChange={set('est')} />
          </Field>
          <Field label="Betalt">
            <input className="input" inputMode="decimal" placeholder="12 495" value={f.price} onChange={set('price')} />
          </Field>
        </div>
        <Field label="Butik">
          <input className="input" placeholder="IKEA Kungens Kurva" value={f.store} onChange={set('store')} />
        </Field>
        <Field label="Länk">
          <input className="input" type="url" inputMode="url" placeholder="https://www.ikea.com/se/sv/p/…" value={f.link} onChange={set('link')} />
        </Field>
        <Field label="Anteckning">
          <textarea className="textarea" rows={3} value={f.note} onChange={set('note')} />
        </Field>
        <label className="checkbox">
          <input type="checkbox" checked={f.bought} onChange={(e) => setF({ ...f, bought: e.target.checked })} />
          <span className="checkbox__box"><svg viewBox="0 0 30 30"><path d="M8 15.5 L13 20.5 L22.5 10" /></svg></span>
          Köpt
        </label>
        <div className="form__actions">
          <Primary>{isNew ? 'Lägg till inköp' : 'Spara inköp'}</Primary>
          {!isNew && <button type="button" className="btn btn--danger" onClick={del}>Ta bort inköp</button>}
        </div>
      </form>
    </Sheet>
  )
}
