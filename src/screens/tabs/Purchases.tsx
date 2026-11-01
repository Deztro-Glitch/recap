import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState, type ReactNode } from 'react'
import { IconExternalLink, IconReceiptOff, IconSearch } from '@tabler/icons-react'
import { api } from '../../lib/api'
import { kr, parseNum } from '../../lib/format'
import { paid } from '../../lib/useProject'
import { Checkbox, Chips, Field, More, Primary, Sheet, useToast } from '../../components/ui'
import { FileField, FileThumb } from '../../components/FileField'
import { DetailsField, DetailsList, cleanDetails } from '../../components/Details'
import { SwipeRow } from '../../components/SwipeRow'
import { PRIORITY_LABEL, type Detail, type Priority, type Purchase } from '../../types'
import type { ProjectState, ViewProps } from '../ProjectView'

export const today = () => new Date().toISOString().slice(0, 10)
export const fmtDate = (d: string) => new Date(d).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })

export function PriorityTag({ priority }: { priority?: number }) {
  if (priority === 1) return <span className="status status--warning">Hög prio</span>
  return null
}

type Tab = 'todo' | 'bought'
type Owner = 'all' | 'mine' | 'stays'
const OWNER_LABEL: Record<Owner, string> = { all: 'Allt', mine: 'Mitt', stays: 'Följer med lägenheten' }

export function markBought(state: ProjectState, p: Purchase, on: boolean) {
  state.patch('purchases', p.id, { bought: on, price: on ? p.price ?? p.est_price : p.price, bought_on: on ? p.bought_on ?? today() : p.bought_on })
}

// Inköp: det som ska köpas, och det som är köpt med kvitton.
export function Purchases({ state, room, open, filter }: ViewProps & { filter: ReactNode }) {
  const [tab, setTab] = useState<Tab>('todo')
  const [owner, setOwner] = useState<Owner>('all')
  const [q, setQ] = useState('')
  const list = state.purchases.filter(
    (p) =>
      (room === null || p.room_id === room) &&
      (owner === 'all' || (owner === 'stays') === !!p.stays) &&
      `${p.title} ${p.store ?? ''}`.toLowerCase().includes(q.toLowerCase()),
  )
  const toBuy = list.filter((p) => !p.bought)
  const bought = list.filter((p) => p.bought).sort((a, b) => (b.bought_on ?? b.created_at).localeCompare(a.bought_on ?? a.created_at))
  const shown = tab === 'todo' ? toBuy : bought
  const missing = bought.filter((p) => !p.receipt_path).length

  return (
    <div>
      <div className="section-head">
        <h1>Inköp</h1>
        <Chips value={tab} onChange={setTab} options={[{ value: 'todo', label: `Att köpa ${toBuy.length}` }, { value: 'bought', label: `Köpt ${bought.length}` }]} />
      </div>

      <div className="plan-tools">
        <label className="search" style={{ maxWidth: 'none' }}>
          <IconSearch size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sök inköp eller butik" />
        </label>
        {filter}
        <Chips value={owner} onChange={setOwner} options={(['all', 'mine', 'stays'] as Owner[]).map((o) => ({ value: o, label: OWNER_LABEL[o] }))} />
      </div>

      {tab === 'bought' && bought.length > 0 && (
        <div className="section" style={{ marginTop: 'var(--s-4)' }}>
          <div className="kpis">
            <div className="kpi"><div className="meta">Följer med lägenheten</div><div className="kpi__value">{kr(bought.filter((p) => p.stays).reduce((s, p) => s + paid(p), 0))}</div></div>
            <div className="kpi"><div className="meta">Mitt</div><div className="kpi__value">{kr(bought.filter((p) => !p.stays).reduce((s, p) => s + paid(p), 0))}</div></div>
          </div>
          {missing > 0 && <div className="budget-status"><span className="status status--warning">{missing} köp saknar kvitto</span></div>}
        </div>
      )}

      {shown.length === 0 ? (
        <div className="empty">
          <h2>{tab === 'todo' ? 'Inget att köpa' : 'Inga köp än'}</h2>
          {tab === 'todo' ? (
            <button className="btn btn--secondary" onClick={() => open({ t: 'purchase', item: { room_id: room } })}>Lägg till inköp</button>
          ) : (
            <button className="btn btn--secondary" onClick={() => open({ t: 'purchase', item: { room_id: room }, receipt: true })}>Lägg till kvitto</button>
          )}
        </div>
      ) : (
        <div className="section" style={{ marginTop: 'var(--s-4)' }}>
          <div className="section-head">
            <h2>{tab === 'todo' ? 'Att köpa' : 'Köpt'}</h2>
            <span className="row__amount">{kr(shown.reduce((s, p) => s + (p.bought ? paid(p) : p.est_price), 0))}</span>
          </div>
          <div className="rows">
            <AnimatePresence initial={false}>
              {shown.map((p) => (
                <PurchaseRow key={p.id} p={p} state={state} showReceipt={tab === 'bought'} onEdit={() => open({ t: 'purchase', item: p })} />
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  )
}

export function PurchaseRow({ p, state, onEdit, showReceipt, showFolder }: { p: Purchase; state: ProjectState; onEdit: () => void; showReceipt?: boolean; showFolder?: boolean }) {
  const room = state.rooms.find((r) => r.id === p.room_id)
  const folder = showFolder ? state.folders.find((f) => f.id === p.folder_id) : undefined
  return (
    <SwipeRow className={p.bought && !showReceipt ? 'is-done' : ''} onClick={onEdit} onDelete={() => removeRow(state, 'purchases', p.id, p.title)}>
      <div className="row__main">
        {showReceipt ? (
          p.receipt_path ? <FileThumb path={p.receipt_path} url={state.urls[p.receipt_path]} /> : <span className="thumb" style={{ width: 40, height: 40 }}><IconReceiptOff size={18} /></span>
        ) : (
          <Checkbox checked={p.bought} onChange={(on) => markBought(state, p, on)} label={p.bought ? `Markera ${p.title} som ej köpt` : `Markera ${p.title} som köpt`} />
        )}
        <div className="row__text">
          <div className="row__title">{p.title}</div>
          <div className="meta">
            {[p.bought && p.bought_on ? fmtDate(p.bought_on) : null, folder?.name, room?.name, p.store, p.stays ? 'Följer med lägenheten' : null].filter(Boolean).join(' · ') || 'Inget rum'}
          </div>
          <DetailsList details={p.details} />
          {!p.bought && <PriorityTag priority={p.priority} />}
          {showReceipt && !p.receipt_path && <span className="status status--warning">Kvitto saknas</span>}
        </div>
      </div>
      {p.link && (
        <a href={p.link} target="_blank" rel="noreferrer" className="row__link" aria-label="Öppna produktlänk" onClick={(e) => e.stopPropagation()}>
          <IconExternalLink size={16} />
        </a>
      )}
      <span className="row__amount">{kr(p.bought ? paid(p) : p.est_price)}</span>
    </SwipeRow>
  )
}

// Tar bort en rad direkt (används när man sveper bort den).
export async function removeRow(state: ProjectState, table: 'purchases' | 'tasks' | 'ideas', id: string, title: string, toast?: (t: string) => void) {
  await api.remove(table, id)
  await state.reload()
  toast?.(`${title} är borttagen`)
}

export type PurchaseDraft = Partial<Purchase>

// Ett inköp, nytt eller befintligt. I kvittoläget börjar formuläret med kvittot och räknas som köpt.
export function PurchaseSheet({ item, state, onClose, receiptMode, title }: {
  item: Purchase | PurchaseDraft | null
  state: ProjectState
  onClose: (saved?: boolean) => void
  receiptMode?: boolean
  title?: string
}) {
  const toast = useToast()
  const p = item && item.id ? (item as Purchase) : null
  const blank = { title: '', room_id: '', folder_id: '', est: '', price: '', store: '', link: '', note: '', bought: false, priority: 2 as Priority, stays: false, receipt: null as string | null, bought_on: '', details: [] as Detail[] }
  const [f, setF] = useState(blank)
  const [receiptUrl, setReceiptUrl] = useState<string | undefined>()

  useEffect(() => {
    if (!item) return
    setF({
      title: item.title ?? '',
      room_id: item.room_id ?? '',
      folder_id: item.folder_id ?? '',
      est: item.est_price ? String(item.est_price) : '',
      price: item.price != null ? String(item.price) : '',
      store: item.store ?? '',
      link: item.link ?? '',
      note: item.note ?? '',
      bought: item.bought ?? !!receiptMode,
      priority: (item.priority ?? 2) as Priority,
      stays: item.stays ?? false,
      receipt: item.receipt_path ?? null,
      bought_on: item.bought_on ?? (receiptMode ? today() : ''),
      details: item.details ?? [],
    })
    setReceiptUrl(item.receipt_path ? state.urls[item.receipt_path] : undefined)
  }, [item])

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })
  const quick = receiptMode && !p

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const price = f.price.trim() ? parseNum(f.price) : null
    const row = {
      title: f.title.trim(),
      room_id: f.room_id || null,
      folder_id: f.folder_id || null,
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
      details: cleanDetails(f.details),
    }
    try {
      if (p) {
        if (p.receipt_path && p.receipt_path !== f.receipt) await api.removeFile(p.receipt_path)
        await api.update('purchases', p.id, row)
      } else await api.insert('purchases', { ...row, project_id: state.project!.id })
      await state.reload()
      toast(p ? 'Ändringarna är sparade' : quick ? 'Kvittot är sparat' : `${row.title} är tillagd`)
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
        setF((c) => ({ ...c, receipt: path, bought: path ? true : c.bought, bought_on: path ? c.bought_on || today() : c.bought_on }))
        setReceiptUrl(url)
      }}
    />
  )

  return (
    <Sheet open={!!item} onClose={() => onClose()} title={title ?? (p ? p.title : quick ? 'Nytt kvitto' : 'Nytt inköp')}>
      <form className="form" onSubmit={save}>
        {quick && receiptField}
        <Field label="Vad">
          <input className="input" placeholder="Väggfärg Alcro Bestå" value={f.title} onChange={set('title')} required />
        </Field>
        <div className="form__row">
          {f.bought ? (
            <Field label="Betalt">
              <input className="input" inputMode="decimal" placeholder="1 295" value={f.price} onChange={set('price')} required={quick} />
            </Field>
          ) : (
            <Field label="Pris ungefär">
              <input className="input" inputMode="decimal" placeholder="1 295" value={f.est} onChange={set('est')} />
            </Field>
          )}
          <Field label="Rum">
            <select className="select" value={f.room_id} onChange={set('room_id')}>
              <option value="">Inget rum</option>
              {state.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Butik">
          <input className="input" placeholder="Colorama Södermalm" value={f.store} onChange={set('store')} />
        </Field>
        {!quick && (
          <label className="checkbox">
            <input type="checkbox" checked={f.bought} onChange={(e) => setF({ ...f, bought: e.target.checked, bought_on: e.target.checked ? f.bought_on || today() : '' })} />
            <span className="checkbox__box"><svg viewBox="0 0 30 30"><path d="M8 15.5 L13 20.5 L22.5 10" /></svg></span>
            Köpt
          </label>
        )}
        {!quick && f.bought && receiptField}

        <More open={!!(p && (p.folder_id || p.stays || p.priority !== 2 || p.details?.length || p.link || p.note))}>
          <div className="field">
            <span className="field__label">Vem äger det</span>
            <Chips value={f.stays} onChange={(v) => setF({ ...f, stays: v })} options={[{ value: false, label: 'Mitt' }, { value: true, label: 'Följer med lägenheten' }]} />
          </div>
          <div className="form__row">
            <Field label="Mapp">
              <select className="select" value={f.folder_id} onChange={set('folder_id')}>
                <option value="">Ingen mapp</option>
                {state.folders.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </Field>
            {f.bought ? (
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
          <DetailsField value={f.details} onChange={(d) => setF({ ...f, details: d })} />
          {!quick && (
            <Field label="Länk">
              <input className="input" type="url" inputMode="url" placeholder="https://" value={f.link} onChange={set('link')} />
            </Field>
          )}
          <Field label="Anteckning">
            <textarea className="textarea" rows={2} value={f.note} onChange={set('note')} />
          </Field>
        </More>

        <div className="form__actions">
          <Primary>{quick ? 'Spara kvitto' : p ? 'Spara inköp' : 'Lägg till inköp'}</Primary>
          {p && <button type="button" className="btn btn--danger" onClick={del}>Ta bort inköp</button>}
        </div>
      </form>
    </Sheet>
  )
}
