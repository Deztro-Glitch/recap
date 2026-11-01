import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { IconReceipt } from '@tabler/icons-react'
import { api } from '../../lib/api'
import { kr, parseNum } from '../../lib/format'
import { Chips, Field, Primary, Sheet, rowAnim, useToast } from '../../components/ui'
import { FileField } from '../../components/FileField'
import { DetailsField, DetailsList, cleanDetails } from '../../components/Details'
import { PRIORITY_LABEL, type Detail, type Priority, type Task, type TaskStatus } from '../../types'
import type { ProjectState } from '../ProjectView'
import { PriorityTag, fmtDate, removeRow, today } from './Purchases'
import { SwipeRow } from '../../components/SwipeRow'

const NEXT: Record<TaskStatus, TaskStatus> = { todo: 'doing', doing: 'done', done: 'todo' }
export const STATUS_LABEL: Record<TaskStatus, string> = { todo: 'Att göra', doing: 'Pågår', done: 'Klar' }
const CLS: Record<TaskStatus, string> = { todo: 'status--draft', doing: 'status--sent', done: 'status--won' }

export const TaskStatusLabel = ({ status = 'todo' }: { status?: TaskStatus }) => <span className={`status ${CLS[status]}`}>{STATUS_LABEL[status]}</span>

export type TaskDraft = Partial<Task>

export function TaskRow({ t, state, onEdit, showFolder }: { t: Task; state: ProjectState; onEdit: () => void; showFolder?: boolean }) {
  const room = state.rooms.find((r) => r.id === t.room_id)
  const folder = showFolder ? state.folders.find((f) => f.id === t.folder_id) : undefined
  const status = t.status ?? 'todo'
  const next = NEXT[status]
  return (
    <SwipeRow className={t.status === 'done' ? 'is-done' : ''} onClick={onEdit} onDelete={() => removeRow(state, 'tasks', t.id, t.title)}>
      <div className="row__text">
        <div className="row__title">{t.title}</div>
        <div className="meta">
          {[folder?.name, room?.name, t.cost ? kr(t.cost) : null, t.status === 'done' && t.done_on ? `Utfört ${fmtDate(t.done_on)}` : null].filter(Boolean).join(' · ') || 'Hela hemmet'}
        </div>
        <DetailsList details={t.details} />
        {t.status !== 'done' && <PriorityTag priority={t.priority} />}
      </div>
      {t.receipt_path && <IconReceipt size={16} aria-label="Har kvitto" />}
      <button
        className="status-btn"
        aria-label={`Ändra status, nu ${STATUS_LABEL[status].toLowerCase()}`}
        onClick={(e) => {
          e.stopPropagation()
          state.patch('tasks', t.id, { status: next, done_on: next === 'done' ? t.done_on ?? today() : t.done_on })
        }}
      >
        <TaskStatusLabel status={status} />
      </button>
    </SwipeRow>
  )
}

export function TaskSheet({ item, state, onClose }: { item: Task | TaskDraft | null; state: ProjectState; onClose: () => void }) {
  const toast = useToast()
  const t = item && 'id' in item && item.id ? (item as Task) : null
  const blank = { title: '', room_id: '', folder_id: '', cost: '', note: '', status: 'todo' as TaskStatus, priority: 2 as Priority, receipt: null as string | null, done_on: '', details: [] as Detail[] }
  const [f, setF] = useState(blank)
  const [receiptUrl, setReceiptUrl] = useState<string | undefined>()

  useEffect(() => {
    if (!item) return
    setF({
      title: item.title ?? '',
      room_id: item.room_id ?? '',
      folder_id: item.folder_id ?? '',
      cost: item.cost ? String(item.cost) : '',
      note: item.note ?? '',
      status: item.status ?? 'todo',
      priority: (item.priority ?? 2) as Priority,
      receipt: item.receipt_path ?? null,
      done_on: item.done_on ?? '',
      details: item.details ?? [],
    })
    setReceiptUrl(item.receipt_path ? state.urls[item.receipt_path] : undefined)
  }, [item])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const row = {
      title: f.title.trim(),
      room_id: f.room_id || null,
      folder_id: f.folder_id || null,
      cost: parseNum(f.cost),
      note: f.note.trim() || null,
      status: f.status,
      priority: f.priority,
      receipt_path: f.receipt,
      done_on: f.status === 'done' ? f.done_on || today() : null,
      details: cleanDetails(f.details),
    }
    try {
      if (t) {
        if (t.receipt_path && t.receipt_path !== f.receipt) await api.removeFile(t.receipt_path)
        await api.update('tasks', t.id, row)
      } else await api.insert('tasks', { ...row, project_id: state.project!.id })
      await state.reload()
      toast(t ? 'Ändringarna är sparade' : `${row.title} är tillagt`)
      onClose()
    } catch (err: any) {
      toast({ title: 'Jobbet kunde inte sparas', body: err.message })
    }
  }

  const del = async () => {
    await api.remove('tasks', t!.id)
    await state.reload()
    toast(`${t!.title} är borttaget`)
    onClose()
  }

  return (
    <Sheet open={!!item} onClose={onClose} title={t ? t.title : 'Nytt jobb'}>
      <form className="form" onSubmit={save}>
        <Field label="Jobb">
          <input className="input" placeholder="Måla om sovrummet" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required />
        </Field>
        <div className="form__row">
          <Field label="Mapp">
            <select className="select" value={f.folder_id} onChange={(e) => setF({ ...f, folder_id: e.target.value })}>
              <option value="">Ingen mapp</option>
              {state.folders.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </Field>
          <Field label="Rum">
            <select className="select" value={f.room_id} onChange={(e) => setF({ ...f, room_id: e.target.value })}>
              <option value="">Hela hemmet</option>
              {state.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="field">
          <span className="field__label">Status</span>
          <Chips value={f.status} onChange={(s) => setF({ ...f, status: s, done_on: s === 'done' ? f.done_on || today() : f.done_on })} options={(['todo', 'doing', 'done'] as TaskStatus[]).map((s) => ({ value: s, label: STATUS_LABEL[s] }))} />
        </div>
        <div className="form__row">
          <Field label="Kostnad i kr">
            <input className="input" inputMode="decimal" placeholder="8 500" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} />
          </Field>
          {f.status === 'done' ? (
            <Field label="Utfört">
              <input className="input" type="date" value={f.done_on} onChange={(e) => setF({ ...f, done_on: e.target.value })} />
            </Field>
          ) : (
            <div className="field">
              <span className="field__label">Prio</span>
              <Chips value={f.priority} onChange={(v) => setF({ ...f, priority: v })} options={([1, 2, 3] as Priority[]).map((v) => ({ value: v, label: PRIORITY_LABEL[v] }))} />
            </div>
          )}
        </div>
        <DetailsField value={f.details} onChange={(d) => setF({ ...f, details: d })} />
        <FileField
          pid={state.project!.id}
          label="Kvitto eller faktura"
          path={f.receipt}
          url={receiptUrl}
          onChange={(path, url) => {
            setF((c) => ({ ...c, receipt: path }))
            setReceiptUrl(url)
          }}
        />
        <Field label="Anteckning">
          <textarea className="textarea" rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </Field>
        <div className="form__actions">
          <Primary>{t ? 'Spara jobb' : 'Lägg till jobb'}</Primary>
          {t && <button type="button" className="btn btn--danger" onClick={del}>Ta bort jobb</button>}
        </div>
      </form>
    </Sheet>
  )
}
