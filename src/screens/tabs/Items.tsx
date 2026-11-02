import { AnimatePresence } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { IconExternalLink, IconStarFilled } from '@tabler/icons-react'
import { api } from '../../lib/api'
import { kr, parseNum } from '../../lib/format'
import { needsInfo, paid } from '../../lib/useProject'
import { Checkbox, Chips, Field, More, Primary, Sheet, useToast } from '../../components/ui'
import { FileField, FileThumb } from '../../components/FileField'
import { DetailsField, DetailsList, cleanDetails } from '../../components/Details'
import { FilterBar, matches, noFilter, type FilterState } from '../../components/Filters'
import { SwipeRow } from '../../components/SwipeRow'
import type { Detail, Purchase, Task } from '../../types'
import type { ProjectState, ViewProps } from '../ProjectView'

export const today = () => new Date().toISOString().slice(0, 10)
export const fmtDate = (d: string) => new Date(d).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })

// Tar bort en rad direkt (används när man sveper bort den).
export async function removeRow(state: ProjectState, table: 'purchases' | 'tasks' | 'contracts', id: string, title: string, toast?: (t: string) => void) {
  await api.remove(table, id)
  await state.reload()
  toast?.(`${title} är borttagen`)
}

// Inköp och jobb är samma sak för den som använder appen: något som är planerat eller klart.
// Nya saker sparas som inköp. Jobb finns kvar i sin egen tabell från tiden innan.
export type ItemTable = 'purchases' | 'tasks'
export interface Item {
  table: ItemTable
  id: string
  title: string
  room_id: string | null
  done: boolean
  amount: number          // betalt när det är klart, annars ungefär vad det kostar
  date: string | null
  important: boolean
  file: string | null     // kvitto
  image: string | null    // bild på det man vill ha
  store: string | null
  link: string | null
  stays: boolean          // följer med lägenheten
  k6: boolean             // värdehöjande förbättring
  details: Detail[] | null
  missing: boolean        // fotat kvitto utan belopp
  created_at: string
  raw: Purchase | Task
}

export const fromPurchase = (p: Purchase): Item => ({
  table: 'purchases', id: p.id, title: p.title, room_id: p.room_id, done: p.bought,
  amount: p.bought ? paid(p) : Number(p.est_price) || 0, date: p.bought ? p.bought_on : null, important: p.priority === 1,
  file: p.receipt_path, image: p.image_path ?? null, store: p.store, link: p.link, stays: !!p.stays, k6: !!p.k6, details: p.details,
  missing: needsInfo(p), created_at: p.created_at, raw: p,
})

export const fromTask = (t: Task): Item => ({
  table: 'tasks', id: t.id, title: t.title, room_id: t.room_id, done: t.status === 'done',
  amount: Number(t.cost) || 0, date: t.status === 'done' ? t.done_on : null, important: t.priority === 1,
  file: t.receipt_path, image: null, store: null, link: null, stays: false, k6: !!t.k6, details: t.details, missing: false, created_at: t.created_at, raw: t,
})

export const allItems = (state: Pick<ProjectState, 'purchases' | 'tasks'>) => [...state.purchases.map(fromPurchase), ...state.tasks.map(fromTask)]

// Allt man kan söka på för en sak.
export const itemText = (it: Item, roomName?: string) =>
  [it.title, roomName, it.store, (it.raw as Purchase).note, ...(it.details ?? []).flatMap((d) => [d.label, d.value])].filter(Boolean).join(' ').toLowerCase()

// Viktigt först, sedan i den ordning de lades till.
export const byImportance = (a: Item, b: Item) => Number(b.important) - Number(a.important) || a.created_at.localeCompare(b.created_at)
export const byDate = (a: Item, b: Item) => (b.date ?? '').localeCompare(a.date ?? '') || b.created_at.localeCompare(a.created_at)
export const sum = (items: Item[]) => items.reduce((s, i) => s + i.amount, 0)

export function setDone(state: ProjectState, it: Item, on: boolean) {
  if (it.table === 'tasks') {
    const t = it.raw as Task
    return state.patch('tasks', it.id, { status: on ? 'done' : 'todo', done_on: on ? t.done_on ?? today() : t.done_on })
  }
  const p = it.raw as Purchase
  return state.patch('purchases', it.id, { bought: on, price: on ? p.price ?? p.est_price : p.price, bought_on: on ? p.bought_on ?? today() : p.bought_on })
}

export const sheetFor = (it: Item) => (it.table === 'tasks' ? { t: 'task' as const, item: it.raw as Task } : { t: 'purchase' as const, item: it.raw as Purchase })

// Bockar av och erbjuder att fota kvittot direkt. Ger tillbaka funktionen och fältet för kameran.
export function useMarkDone(state: ProjectState) {
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const target = useRef<Item | null>(null)

  const markDone = (it: Item) => {
    setDone(state, it, true)
    toast({
      title: `${it.title} är klart`,
      action: it.file ? undefined : { label: 'Fota kvittot', on: () => { target.current = it; input.current?.click() } },
    })
  }

  const onFile = async (file: File | undefined) => {
    const it = target.current
    if (!file || !it) return
    try {
      const path = await api.uploadFile(state.project!.id, file)
      await state.patch(it.table, it.id, { receipt_path: path })
      toast('Kvittot är sparat')
    } catch (err: any) {
      toast({ title: 'Kvittot kunde inte sparas', body: err.message })
    } finally {
      if (input.current) input.current.value = ''
    }
  }

  const field = <input ref={input} type="file" accept="image/*,application/pdf" hidden onChange={(e) => onFile(e.target.files?.[0])} />
  return { markDone, field }
}

// Inköp: planerat till vänster, klart till höger. Bockar man av flyttar saken över.
export function Purchases({ state, open }: ViewProps) {
  const { markDone, field } = useMarkDone(state)
  const [filter, setFilter] = useState<FilterState>(noFilter)
  const roomName = (id: string | null) => state.rooms.find((r) => r.id === id)?.name
  const items = allItems(state).filter((it) => matches(filter, { ...it, text: itemText(it, roomName(it.room_id)) }))
  const planned = items.filter((i) => !i.done).sort(byImportance)
  const done = items.filter((i) => i.done).sort(byDate)

  return (
    <div>
      {field}
      <div className="section-head"><h1>Inköp</h1></div>
      <FilterBar state={state} value={filter} onChange={setFilter} placeholder="Sök inköp, butik eller färgkod" />

      <div className="columns section">
        <div>
          <div className="section-head">
            <h2>Planerat</h2>
            <span className="row__amount">{kr(sum(planned))}</span>
          </div>
          <ItemList items={planned} state={state} open={open} onCheck={markDone} empty="Inget planerat" />
        </div>
        <div>
          <div className="section-head">
            <h2>Klart</h2>
            <span className="row__amount">{kr(sum(done))}</span>
          </div>
          <ItemList items={done} state={state} open={open} empty="Inget klart än" />
        </div>
      </div>
    </div>
  )
}

export function ItemRow({ it, state, onEdit, onCheck, hideRoom }: { it: Item; state: ProjectState; onEdit: () => void; onCheck?: (it: Item) => void; hideRoom?: boolean }) {
  const room = hideRoom ? undefined : state.rooms.find((r) => r.id === it.room_id)
  const thumb = it.done ? it.file : it.image
  return (
    <SwipeRow onClick={onEdit} onDelete={() => removeRow(state, it.table, it.id, it.title)}>
      <div className="row__main">
        <Checkbox
          checked={it.done}
          onChange={(on) => (on && onCheck ? onCheck(it) : setDone(state, it, on))}
          label={it.done ? `Flytta ${it.title} till planerat` : `Markera ${it.title} som klart`}
        />
        {thumb && <FileThumb path={thumb} url={state.urls[thumb]} />}
        <div className="row__text">
          <div className="row__title">
            {!it.done && it.important && <IconStarFilled size={13} className="star" aria-label="Viktigt" />}
            {it.title}
          </div>
          <div className="meta">{[it.date ? fmtDate(it.date) : null, room?.name, it.store].filter(Boolean).join(' · ')}</div>
          <DetailsList details={it.details} />
          <ItemTags it={it} />
        </div>
      </div>
      {it.link && (
        <a href={it.link} target="_blank" rel="noreferrer" className="row__link" aria-label="Öppna länken" onClick={(e) => e.stopPropagation()}>
          <IconExternalLink size={16} />
        </a>
      )}
      {it.amount > 0 && <span className="row__amount">{it.done ? kr(it.amount) : `ca ${kr(it.amount)}`}</span>}
    </SwipeRow>
  )
}

export function ItemTags({ it }: { it: Pick<Item, 'stays' | 'k6' | 'missing'> }) {
  if (!it.stays && !it.k6 && !it.missing) return null
  return (
    <div className="tags">
      {it.stays && <span className="tag">Följer med</span>}
      {it.k6 && <span className="tag">K6</span>}
      {it.missing && <span className="status status--warning">Belopp saknas</span>}
    </div>
  )
}

export function ItemList({ items, state, open, onCheck, empty, hideRoom }: { items: Item[]; state: ProjectState; open: ViewProps['open']; onCheck?: (it: Item) => void; empty: string; hideRoom?: boolean }) {
  if (!items.length) return <p className="meta">{empty}</p>
  return (
    <div className="rows">
      <AnimatePresence initial={false}>
        {items.map((it) => <ItemRow key={it.id} it={it} state={state} hideRoom={hideRoom} onCheck={onCheck} onEdit={() => open(sheetFor(it))} />)}
      </AnimatePresence>
    </div>
  )
}

// Ett och samma formulär för köp och jobb, nya och gamla.
export function ItemSheet({ table, item, state, onClose, title }: {
  table: ItemTable
  item: Partial<Purchase> | Partial<Task> | null
  state: ProjectState
  onClose: (saved?: boolean) => void
  title?: string
}) {
  const toast = useToast()
  const existing = item?.id ? (table === 'tasks' ? fromTask(item as Task) : fromPurchase(item as Purchase)) : null
  const isTask = table === 'tasks'
  const blank = { title: '', room_id: '', done: false, amount: '', date: '', store: '', link: '', note: '', important: false, stays: false, k6: false, receipt: null as string | null, image: null as string | null, details: [] as Detail[] }
  const [f, setF] = useState(blank)
  const [urls, setUrls] = useState<{ receipt?: string; image?: string }>({})

  useEffect(() => {
    if (!item) return
    const p = item as Partial<Purchase>
    const t = item as Partial<Task>
    const done = isTask ? t.status === 'done' : !!p.bought
    const amount = isTask ? t.cost : done ? p.price ?? (Number(p.est_price) || null) : p.est_price
    const receipt = (isTask ? t.receipt_path : p.receipt_path) ?? null
    const image = p.image_path ?? null
    setF({
      title: item.title ?? '',
      room_id: item.room_id ?? '',
      done,
      amount: amount ? String(amount) : '',
      date: (isTask ? t.done_on : p.bought_on) ?? '',
      store: p.store ?? '',
      link: p.link ?? '',
      note: item.note ?? '',
      important: item.priority === 1,
      stays: !!p.stays,
      k6: !!item.k6,
      receipt,
      image,
      details: item.details ?? [],
    })
    setUrls({ receipt: receipt ? state.urls[receipt] : undefined, image: image ? state.urls[image] : undefined })
  }, [item])

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })
  const setDoneField = (done: boolean) => setF((c) => ({ ...c, done, date: done ? c.date || today() : c.date }))

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const amount = f.amount.trim() ? parseNum(f.amount) : null
    const date = f.done ? f.date || today() : null
    const common = {
      title: f.title.trim(),
      room_id: f.room_id || null,
      note: f.note.trim() || null,
      priority: f.important ? 1 : 2,
      k6: f.k6,
      receipt_path: f.receipt,
      details: cleanDetails(f.details),
    }
    const row = isTask
      ? { ...common, cost: amount ?? 0, status: f.done ? 'done' : (item as Task).status === 'doing' ? 'doing' : 'todo', done_on: date }
      : {
          ...common,
          bought: f.done,
          price: f.done ? amount : null,
          est_price: f.done ? Number((item as Purchase).est_price) || 0 : amount ?? 0,
          bought_on: date,
          store: f.store.trim() || null,
          link: f.link.trim() || null,
          stays: f.stays,
          image_path: f.image,
        }
    try {
      if (existing) {
        for (const [old, now] of [[existing.file, f.receipt], [existing.image, f.image]]) if (old && old !== now) await api.removeFile(old)
        await api.update(table, existing.id, row)
      } else await api.insert(table, { ...row, project_id: state.project!.id })
      await state.reload()
      toast(existing ? 'Ändringarna är sparade' : `${row.title} är tillagt`)
      onClose(true)
    } catch (err: any) {
      toast({ title: 'Det gick inte att spara', body: err.message })
    }
  }

  const del = async () => {
    await api.remove(table, existing!.id)
    await state.reload()
    toast(`${existing!.title} är borttaget`)
    onClose(true)
  }

  return (
    <Sheet open={!!item} onClose={() => onClose()} title={title ?? (existing ? existing.title : f.done ? 'Klart' : 'Planerat')}>
      <form className="form" onSubmit={save}>
        <Field label="Vad">
          <input className="input" placeholder="Diskmaskin, måla hallen" value={f.title} onChange={set('title')} required />
        </Field>
        <Chips value={f.done} onChange={setDoneField} options={[{ value: false, label: 'Planerat' }, { value: true, label: 'Klart' }]} />
        <div className="form__row">
          <Field label={f.done ? 'Kostade' : 'Kostar ungefär'}>
            <input className="input" inputMode="decimal" placeholder="1 295" value={f.amount} onChange={set('amount')} />
          </Field>
          {f.done ? (
            <Field label="Datum">
              <input className="input" type="date" value={f.date} onChange={set('date')} />
            </Field>
          ) : (
            <Field label="Rum">
              <RoomSelect state={state} value={f.room_id} onChange={(v) => setF({ ...f, room_id: v })} />
            </Field>
          )}
        </div>
        {f.done && (
          <Field label="Rum">
            <RoomSelect state={state} value={f.room_id} onChange={(v) => setF({ ...f, room_id: v })} />
          </Field>
        )}
        {!isTask && (
          <Field label="Butik eller hantverkare">
            <input className="input" placeholder="Colorama Södermalm" value={f.store} onChange={set('store')} />
          </Field>
        )}
        <div className="toggles">
          {!f.done && <Toggle checked={f.important} onChange={(v) => setF({ ...f, important: v })} label="Viktigt" />}
          {!isTask && <Toggle checked={f.stays} onChange={(v) => setF({ ...f, stays: v })} label="Följer med lägenheten" />}
          <Toggle checked={f.k6} onChange={(v) => setF({ ...f, k6: v })} label="Värdehöjande förbättring (K6)" />
        </div>
        {f.done && (
          <FileField pid={state.project!.id} label="Kvitto" path={f.receipt} url={urls.receipt}
            onChange={(path, url) => { setF((c) => ({ ...c, receipt: path })); setUrls((u) => ({ ...u, receipt: url })) }} />
        )}

        <More open={!!(existing && (existing.details?.length || existing.link || existing.image || item?.note))}>
          {!isTask && (
            <FileField pid={state.project!.id} label="Bild" accept="image/*" path={f.image} url={urls.image}
              onChange={(path, url) => { setF((c) => ({ ...c, image: path })); setUrls((u) => ({ ...u, image: url })) }} />
          )}
          <DetailsField value={f.details} onChange={(d) => setF({ ...f, details: d })} />
          {!isTask && (
            <Field label="Länk">
              <input className="input" type="url" inputMode="url" placeholder="https://" value={f.link} onChange={set('link')} />
            </Field>
          )}
          <Field label="Anteckning">
            <textarea className="textarea" rows={2} value={f.note} onChange={set('note')} />
          </Field>
        </More>

        <div className="form__actions">
          <Primary>{existing ? 'Spara' : 'Lägg till'}</Primary>
          {existing && <button type="button" className="btn btn--danger" onClick={del}>Ta bort</button>}
        </div>
      </form>
    </Sheet>
  )
}

export function RoomSelect({ state, value, onChange }: { state: ProjectState; value: string; onChange: (v: string) => void }) {
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Inget rum</option>
      {state.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
    </select>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="checkbox">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="checkbox__box"><svg viewBox="0 0 30 30"><path d="M8 15.5 L13 20.5 L22.5 10" /></svg></span>
      {label}
    </label>
  )
}

// Detaljer som färgkod och mått från allt i rummet, utan dubbletter.
export function roomFacts(items: Item[]): Detail[] {
  const seen = new Set<string>()
  return items.flatMap((i) => i.details ?? []).filter((d) => {
    const k = `${d.label}|${d.value}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}
