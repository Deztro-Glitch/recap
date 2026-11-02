import { AnimatePresence } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { IconExternalLink, IconStarFilled } from '@tabler/icons-react'
import { api } from '../../lib/api'
import { kr, parseNum } from '../../lib/format'
import { needsInfo, paid } from '../../lib/useProject'
import { Checkbox, Chips, Field, More, Primary, Sheet, useToast } from '../../components/ui'
import { FileField, FileThumb } from '../../components/FileField'
import { DetailsField, DetailsList, cleanDetails } from '../../components/Details'
import { SwipeRow } from '../../components/SwipeRow'
import type { Detail, Purchase, Task } from '../../types'
import type { ProjectState, ViewProps } from '../ProjectView'

export const today = () => new Date().toISOString().slice(0, 10)
export const fmtDate = (d: string) => new Date(d).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })

// Tar bort en rad direkt (används när man sveper bort den).
export async function removeRow(state: ProjectState, table: 'purchases' | 'tasks' | 'ideas', id: string, title: string, toast?: (t: string) => void) {
  await api.remove(table, id)
  await state.reload()
  toast?.(`${title} är borttagen`)
}

// Inköp och jobb är samma sak för den som använder appen: något som ska göras eller är gjort.
// Nya saker sparas som inköp. Jobb finns kvar i sin egen tabell från tiden innan.
export type ItemTable = 'purchases' | 'tasks'
export interface Item {
  table: ItemTable
  id: string
  title: string
  room_id: string | null
  folder_id: string | null
  done: boolean
  amount: number          // betalt när det är gjort, annars ungefär vad det kostar
  date: string | null
  important: boolean
  file: string | null
  store: string | null
  link: string | null
  stays: boolean
  details: Detail[] | null
  missing: boolean        // fotat kvitto utan belopp
  created_at: string
  raw: Purchase | Task
}

export const fromPurchase = (p: Purchase): Item => ({
  table: 'purchases', id: p.id, title: p.title, room_id: p.room_id, folder_id: p.folder_id, done: p.bought,
  amount: p.bought ? paid(p) : Number(p.est_price) || 0, date: p.bought ? p.bought_on : null, important: p.priority === 1,
  file: p.receipt_path, store: p.store, link: p.link, stays: !!p.stays, details: p.details, missing: needsInfo(p), created_at: p.created_at, raw: p,
})

export const fromTask = (t: Task): Item => ({
  table: 'tasks', id: t.id, title: t.title, room_id: t.room_id, folder_id: t.folder_id, done: t.status === 'done',
  amount: Number(t.cost) || 0, date: t.status === 'done' ? t.done_on : null, important: t.priority === 1,
  file: t.receipt_path, store: null, link: null, stays: true, details: t.details, missing: false, created_at: t.created_at, raw: t,
})

export const allItems = (state: Pick<ProjectState, 'purchases' | 'tasks'>) => [...state.purchases.map(fromPurchase), ...state.tasks.map(fromTask)]

// Viktigt först, sedan i den ordning de lades till.
export const byImportance = (a: Item, b: Item) => Number(b.important) - Number(a.important) || a.created_at.localeCompare(b.created_at)

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
      title: `${it.title} ligger nu i loggen`,
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

// Att göra: det som ska köpas eller göras. När det bockas av flyttar det till loggen.
export function Todo({ state, open }: ViewProps) {
  const { markDone, field } = useMarkDone(state)
  const list = allItems(state).filter((i) => !i.done).sort(byImportance)
  const total = list.reduce((s, i) => s + i.amount, 0)

  return (
    <div>
      {field}
      <div className="section-head">
        <h1>Att göra</h1>
        <button className="btn btn--ghost" onClick={() => open({ t: 'purchase', item: {} })}>Lägg till</button>
      </div>

      {list.length === 0 ? (
        <div className="empty">
          <h2>Inget att göra</h2>
          <p className="meta">Skriv upp det du ska köpa eller göra. När du bockar av det hamnar det i loggen.</p>
          <button className="btn btn--secondary" onClick={() => open({ t: 'purchase', item: {} })}>Lägg till</button>
        </div>
      ) : (
        <>
          {total > 0 && <p className="meta">{list.length} saker · ungefär {kr(total)} kvar</p>}
          <div className="rows" style={{ marginTop: 'var(--s-4)' }}>
            <AnimatePresence initial={false}>
              {list.map((it) => <ItemRow key={it.id} it={it} state={state} showFolder onCheck={markDone} onEdit={() => open(sheetFor(it))} />)}
            </AnimatePresence>
          </div>
        </>
      )}
    </div>
  )
}

export function ItemRow({ it, state, onEdit, onCheck, showFolder }: { it: Item; state: ProjectState; onEdit: () => void; onCheck?: (it: Item) => void; showFolder?: boolean }) {
  const room = state.rooms.find((r) => r.id === it.room_id)
  const folder = showFolder ? state.folders.find((f) => f.id === it.folder_id) : undefined
  return (
    <SwipeRow onClick={onEdit} onDelete={() => removeRow(state, it.table, it.id, it.title)}>
      <div className="row__main">
        {it.done && it.file ? (
          <FileThumb path={it.file} url={state.urls[it.file]} />
        ) : (
          <Checkbox
            checked={it.done}
            onChange={(on) => (on && onCheck ? onCheck(it) : setDone(state, it, on))}
            label={it.done ? `Markera ${it.title} som inte gjort` : `Markera ${it.title} som gjort`}
          />
        )}
        <div className="row__text">
          <div className="row__title">
            {!it.done && it.important && <IconStarFilled size={13} className="star" aria-label="Viktigt" />}
            {it.title}
          </div>
          <div className="meta">{[it.date ? fmtDate(it.date) : null, folder?.name, room?.name, it.store].filter(Boolean).join(' · ') || 'Hela hemmet'}</div>
          <DetailsList details={it.details} />
          {it.missing && <span className="status status--warning">Belopp saknas</span>}
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

export function ItemList({ items, state, open, onCheck, empty }: { items: Item[]; state: ProjectState; open: ViewProps['open']; onCheck?: (it: Item) => void; empty: string }) {
  if (!items.length) return <p className="meta">{empty}</p>
  return <div className="rows">{items.map((it) => <ItemRow key={it.id} it={it} state={state} showFolder onCheck={onCheck} onEdit={() => open(sheetFor(it))} />)}</div>
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
  const blank = { title: '', room_id: '', folder_id: '', done: false, amount: '', date: '', store: '', link: '', note: '', important: false, stays: false, receipt: null as string | null, details: [] as Detail[] }
  const [f, setF] = useState(blank)
  const [receiptUrl, setReceiptUrl] = useState<string | undefined>()

  useEffect(() => {
    if (!item) return
    const p = item as Partial<Purchase>
    const t = item as Partial<Task>
    const done = isTask ? t.status === 'done' : !!p.bought
    const amount = isTask ? t.cost : done ? p.price ?? (Number(p.est_price) || null) : p.est_price
    const file = (isTask ? t.receipt_path : p.receipt_path) ?? null
    setF({
      title: item.title ?? '',
      room_id: item.room_id ?? '',
      folder_id: item.folder_id ?? '',
      done,
      amount: amount ? String(amount) : '',
      date: (isTask ? t.done_on : p.bought_on) ?? '',
      store: p.store ?? '',
      link: p.link ?? '',
      note: item.note ?? '',
      important: item.priority === 1,
      stays: !!p.stays,
      receipt: file,
      details: item.details ?? [],
    })
    setReceiptUrl(file ? state.urls[file] : undefined)
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
      folder_id: f.folder_id || null,
      note: f.note.trim() || null,
      priority: f.important ? 1 : 2,
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
        }
    try {
      if (existing) {
        if (existing.file && existing.file !== f.receipt) await api.removeFile(existing.file)
        await api.update(table, existing.id, row)
      } else await api.insert(table, { ...row, project_id: state.project!.id })
      await state.reload()
      toast(existing ? 'Ändringarna är sparade' : f.done ? `${row.title} ligger i loggen` : `${row.title} är tillagt`)
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
    <Sheet open={!!item} onClose={() => onClose()} title={title ?? (existing ? existing.title : f.done ? 'Något som är gjort' : 'Något att göra')}>
      <form className="form" onSubmit={save}>
        <Field label="Vad">
          <input className="input" placeholder="Diskmaskin, måla hallen" value={f.title} onChange={set('title')} required />
        </Field>
        <Chips value={f.done} onChange={setDoneField} options={[{ value: false, label: 'Att göra' }, { value: true, label: 'Gjort' }]} />
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
        {!f.done && <Toggle checked={f.important} onChange={(v) => setF({ ...f, important: v })} label="Viktigt" />}
        {!isTask && (
          <Field label="Butik eller hantverkare">
            <input className="input" placeholder="Colorama Södermalm" value={f.store} onChange={set('store')} />
          </Field>
        )}
        {f.done && (
          <FileField
            pid={state.project!.id}
            label="Kvitto"
            path={f.receipt}
            url={receiptUrl}
            onChange={(path, url) => {
              setF((c) => ({ ...c, receipt: path }))
              setReceiptUrl(url)
            }}
          />
        )}

        <More open={!!(existing && (existing.folder_id || (!isTask && existing.stays) || existing.details?.length || existing.link || item?.note))}>
          {!isTask && <Toggle checked={f.stays} onChange={(v) => setF({ ...f, stays: v })} label="Följer med lägenheten" />}
          {state.folders.length > 0 && (
            <Field label="Mapp">
              <select className="select" value={f.folder_id} onChange={set('folder_id')}>
                <option value="">Ingen mapp</option>
                {state.folders.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </Field>
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
          <Primary>{existing ? 'Spara' : f.done ? 'Lägg till i loggen' : 'Lägg till'}</Primary>
          {existing && <button type="button" className="btn btn--danger" onClick={del}>Ta bort</button>}
        </div>
      </form>
    </Sheet>
  )
}

function RoomSelect({ state, value, onChange }: { state: ProjectState; value: string; onChange: (v: string) => void }) {
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Hela hemmet</option>
      {state.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
    </select>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="checkbox">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="checkbox__box"><svg viewBox="0 0 30 30"><path d="M8 15.5 L13 20.5 L22.5 10" /></svg></span>
      {label}
    </label>
  )
}
