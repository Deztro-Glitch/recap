import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState, type ReactNode } from 'react'
import { IconExternalLink, IconReceipt } from '@tabler/icons-react'
import { api } from '../../lib/api'
import { kr, parseNum } from '../../lib/format'
import { paid } from '../../lib/useProject'
import { Checkbox, Chips, Field, Primary, Sheet, rowAnim, useToast } from '../../components/ui'
import { FileField } from '../../components/FileField'
import { PRIORITY_LABEL, type Priority, type Purchase, type Room } from '../../types'
import type { ViewProps } from '../ProjectView'

type Owner = 'all' | 'mine' | 'stays'
const OWNER_LABEL: Record<Owner, string> = { all: 'Allt', mine: 'Mitt', stays: 'Följer med lägenheten' }

export const today = () => new Date().toISOString().slice(0, 10)

export function PriorityTag({ priority }: { priority?: number }) {
  if (priority === 1) return <span className="status status--warning">Hög prio</span>
  return null
}

export function Purchases({ state, room, q, adding, setAdding, filter }: ViewProps & { filter: ReactNode }) {
  const [editing, setEditing] = useState<Purchase | null>(null)
  const [owner, setOwner] = useState<Owner>('all')
  const list = state.purchases.filter(
    (p) =>
      (room === null || p.room_id === room) &&
      (owner === 'all' || (owner === 'stays') === !!p.stays) &&
      p.title.toLowerCase().includes(q.toLowerCase()),
  )
  const toBuy = list.filter((p) => !p.bought)
  const bought = list.filter((p) => p.bought)
  const roomOf = (id: string | null) => state.rooms.find((r) => r.id === id)

  const toggle = (p: Purchase, on: boolean) =>
    state.patch('purchases', p.id, { bought: on, price: on ? p.price ?? p.est_price : p.price, bought_on: on ? p.bought_on ?? today() : p.bought_on })

  return (
    <div>
      <div className="section-head">
        <h1>Inköp</h1>
        {filter}
      </div>
      <div style={{ marginBottom: 'var(--s-5)' }}>
        <Chips value={owner} onChange={setOwner} options={(['all', 'mine', 'stays'] as Owner[]).map((o) => ({ value: o, label: OWNER_LABEL[o] }))} />
      </div>

      {list.length === 0 ? (
        <div className="empty">
          <h2>{q || room || owner !== 'all' ? 'Inga inköp här' : 'Inga inköp än'}</h2>
          <button className="btn btn--secondary" onClick={() => setAdding(true)}>Lägg till inköp</button>
        </div>
      ) : (
        <>
          {toBuy.length > 0 && (
            <Group title="Att köpa" total={toBuy.reduce((s, p) => s + p.est_price, 0)}>
              {toBuy.map((p) => <PurchaseRow key={p.id} p={p} room={roomOf(p.room_id)} onToggle={(on) => toggle(p, on)} onEdit={() => setEditing(p)} />)}
            </Group>
          )}
          {bought.length > 0 && (
            <Group title="Köpt" total={bought.reduce((s, p) => s + paid(p), 0)}>
              {bought.map((p) => <PurchaseRow key={p.id} p={p} room={roomOf(p.room_id)} onToggle={(on) => toggle(p, on)} onEdit={() => setEditing(p)} />)}
            </Group>
          )}
        </>
      )}

      <PurchaseSheet
        item={editing ?? (adding ? 'new' : null)}
        defaultRoom={room}
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

export function PurchaseRow({ p, room, onToggle, onEdit }: { p: Purchase; room?: Room; onToggle: (on: boolean) => void; onEdit: () => void }) {
  return (
    <motion.div layout="position" {...rowAnim} className={`row ${p.bought ? 'is-done' : ''}`} onClick={onEdit}>
      <div className="row__main">
        <Checkbox checked={p.bought} onChange={onToggle} label={p.bought ? `Markera ${p.title} som ej köpt` : `Markera ${p.title} som köpt`} />
        {room && <span className="row__swatch" style={{ background: `var(--c-${room.color}-bg)` }} />}
        <div className="row__text">
          <div className="row__title">{p.title}</div>
          <div className="meta">{[room?.name, p.store, p.stays ? 'Följer med lägenheten' : null].filter(Boolean).join(' · ') || 'Inget rum'}</div>
          {!p.bought && <PriorityTag priority={p.priority} />}
        </div>
      </div>
      {p.receipt_path && <IconReceipt size={16} aria-label="Har kvitto" />}
      {p.link && (
        <a href={p.link} target="_blank" rel="noreferrer" className="row__link" aria-label="Öppna produktlänk" onClick={(e) => e.stopPropagation()}>
          <IconExternalLink size={16} />
        </a>
      )}
      <span className="row__amount">{kr(p.bought ? paid(p) : p.est_price)}</span>
    </motion.div>
  )
}

export type PurchaseDraft = Partial<Purchase>

// Används av Inköp, Kvitton (nytt kvitto = köpt inköp) och Idéer (gör idé till inköp).
export function PurchaseSheet({ item, defaultRoom, state, onClose, receiptMode, title }: {
  item: Purchase | 'new' | PurchaseDraft | null
  defaultRoom: string | null
  state: ViewProps['state']
  onClose: (saved?: boolean) => void
  receiptMode?: boolean
  title?: string
}) {
  const toast = useToast()
  const p = item && item !== 'new' && 'id' in item && item.id ? (item as Purchase) : null
  const draft = item && item !== 'new' && !p ? (item as PurchaseDraft) : null
  const isNew = !p
  const blank = { title: '', room_id: '', est: '', price: '', store: '', link: '', note: '', bought: false, priority: 2 as Priority, stays: false, receipt: null as string | null, bought_on: '' }
  const [f, setF] = useState(blank)
  const [receiptUrl, setReceiptUrl] = useState<string | undefined>()

  useEffect(() => {
    if (!item) return
    const src = p ?? draft
    setF({
      title: src?.title ?? '',
      room_id: src ? src.room_id ?? '' : defaultRoom ?? '',
      est: src?.est_price ? String(src.est_price) : '',
      price: src?.price != null ? String(src.price) : '',
      store: src?.store ?? '',
      link: src?.link ?? '',
      note: src?.note ?? '',
      bought: src?.bought ?? !!receiptMode,
      priority: (src?.priority ?? 2) as Priority,
      stays: src?.stays ?? false,
      receipt: src?.receipt_path ?? null,
      bought_on: src?.bought_on ?? (receiptMode ? today() : ''),
    })
    setReceiptUrl(p?.receipt_path ? state.urls[p.receipt_path] : undefined)
  }, [item])

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const price = f.price.trim() ? parseNum(f.price) : null
    const row = {
      title: f.title.trim(),
      room_id: f.room_id || null,
      est_price: f.est.trim() ? parseNum(f.est) : price ?? 0,
      price,
      store: f.store.trim() || null,
      link: f.link.trim() || null,
      note: f.note.trim() || null,
      bought: f.bought,
      priority: f.priority,
      stays: f.stays,
      receipt_path: f.receipt,
      bought_on: f.bought ? f.bought_on || today() : null,
    }
    try {
      if (p) {
        if (p.receipt_path && p.receipt_path !== f.receipt) await api.removeFile(p.receipt_path)
        await api.update('purchases', p.id, row)
      } else await api.insert('purchases', { ...row, project_id: state.project!.id })
      await state.reload()
      toast(isNew ? `${row.title} är tillagd` : 'Ändringarna är sparade')
      onClose(true)
    } catch (err: any) {
      toast({ title: 'Inköpet kunde inte sparas', body: err.message })
    }
  }

  const del = async () => {
    await api.remove('purchases', p!.id)
    await state.reload()
    toast(`${p!.title} är borttagen`)
    onClose(true)
  }

  const receiptField = (
    <FileField
      pid={state.project!.id}
      label="Kvitto"
      path={f.receipt}
      url={receiptUrl}
      onChange={(path, url) => {
        setF((c) => ({ ...c, receipt: path, bought: path ? true : c.bought }))
        setReceiptUrl(url)
      }}
    />
  )

  return (
    <Sheet open={!!item} onClose={() => onClose()} title={title ?? (p ? p.title : 'Nytt inköp')}>
      <form className="form" onSubmit={save}>
        {receiptMode && receiptField}
        <Field label="Vad">
          <input className="input" placeholder="Soffa Söderhamn" value={f.title} onChange={set('title')} required />
        </Field>
        <Field label="Rum">
          <select className="select" value={f.room_id} onChange={set('room_id')}>
            <option value="">Inget rum</option>
            {state.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
        <div className="field">
          <span className="field__label">Vem äger det</span>
          <Chips value={f.stays} onChange={(v) => setF({ ...f, stays: v })} options={[{ value: false, label: 'Mitt' }, { value: true, label: 'Följer med lägenheten' }]} />
        </div>
        <div className="form__row">
          {receiptMode ? (
            <Field label="Belopp">
              <input className="input" inputMode="decimal" placeholder="12 495" value={f.price} onChange={set('price')} required />
            </Field>
          ) : (
            <Field label="Uppskattat pris">
              <input className="input" inputMode="decimal" placeholder="12 995" value={f.est} onChange={set('est')} />
            </Field>
          )}
          {receiptMode || f.bought ? (
            <Field label="Köpdatum">
              <input className="input" type="date" value={f.bought_on} onChange={set('bought_on')} />
            </Field>
          ) : (
            <div className="field">
              <span className="field__label">Prio</span>
              <Chips value={f.priority} onChange={(v) => setF({ ...f, priority: v })} options={([1, 2, 3] as Priority[]).map((v) => ({ value: v, label: PRIORITY_LABEL[v] }))} />
            </div>
          )}
        </div>
        {!receiptMode && f.bought && (
          <Field label="Betalt">
            <input className="input" inputMode="decimal" placeholder="12 495" value={f.price} onChange={set('price')} />
          </Field>
        )}
        <Field label="Butik">
          <input className="input" placeholder="IKEA Kungens Kurva" value={f.store} onChange={set('store')} />
        </Field>
        {!receiptMode && (
          <Field label="Länk">
            <input className="input" type="url" inputMode="url" placeholder="https://www.ikea.com/se/sv/p/…" value={f.link} onChange={set('link')} />
          </Field>
        )}
        <Field label="Anteckning">
          <textarea className="textarea" rows={2} value={f.note} onChange={set('note')} />
        </Field>
        {!receiptMode && (
          <label className="checkbox">
            <input type="checkbox" checked={f.bought} onChange={(e) => setF({ ...f, bought: e.target.checked, bought_on: e.target.checked ? f.bought_on || today() : '' })} />
            <span className="checkbox__box"><svg viewBox="0 0 30 30"><path d="M8 15.5 L13 20.5 L22.5 10" /></svg></span>
            Köpt
          </label>
        )}
        {!receiptMode && f.bought && receiptField}
        <div className="form__actions">
          <Primary>{receiptMode ? 'Spara kvitto' : isNew ? 'Lägg till inköp' : 'Spara inköp'}</Primary>
          {p && <button type="button" className="btn btn--danger" onClick={del}>Ta bort inköp</button>}
        </div>
      </form>
    </Sheet>
  )
}
