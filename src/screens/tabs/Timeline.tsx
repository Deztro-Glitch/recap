import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState, type ReactNode } from 'react'
import { api } from '../../lib/api'
import { kr, parseNum } from '../../lib/format'
import { blockers } from '../../lib/useProject'
import { Chips, Field, Primary, Sheet, rowAnim, useToast } from '../../components/ui'
import { FileField } from '../../components/FileField'
import { PHASES, PRIORITY_LABEL, type Priority, type Task, type TaskStatus } from '../../types'
import type { ViewProps } from '../ProjectView'
import { PriorityTag } from './Purchases'

const NEXT: Record<TaskStatus, TaskStatus> = { todo: 'doing', doing: 'done', done: 'todo' }
const LABEL: Record<TaskStatus, string> = { todo: 'Att göra', doing: 'Pågår', done: 'Klar' }
const CLS: Record<TaskStatus, string> = { todo: 'status--draft', doing: 'status--sent', done: 'status--won' }

export const TaskStatusLabel = ({ status }: { status: TaskStatus }) => <span className={`status ${CLS[status]}`}>{LABEL[status]}</span>

export function Timeline({ state, room, q, adding, setAdding, phase, onPhase, filter }: ViewProps & { phase: number; onPhase: (p: number) => void; filter: ReactNode }) {
  const [editing, setEditing] = useState<Task | null>(null)
  const tasks = state.tasks.filter((t) => (room === null || t.room_id === room) && t.title.toLowerCase().includes(q.toLowerCase()))
  const inPhase = tasks.filter((t) => t.phase === phase)
  const roomName = (id: string | null) => state.rooms.find((r) => r.id === id)?.name

  return (
    <div>
      <div className="section-head">
        <h1>Renovering</h1>
        {filter}
      </div>

      <div className="section">
        <div className="section-head">
          <h2>{PHASES[phase].name}</h2>
          {inPhase.length > 0 && <span className="meta">{inPhase.filter((t) => t.status === 'done').length} av {inPhase.length} klara</span>}
        </div>
        {inPhase.length === 0 ? (
          <div className="empty" style={{ paddingTop: 8 }}>
            <h3>Inga jobb i {PHASES[phase].name.toLowerCase()}</h3>
            <button className="btn btn--secondary" onClick={() => setAdding(true)}>Lägg till jobb</button>
          </div>
        ) : (
          <div className="rows">
            <AnimatePresence initial={false}>
              {inPhase.map((t) => {
                const blocked = t.status !== 'todo' ? blockers(t, state.tasks) : []
                return (
                  <motion.div layout="position" key={t.id} {...rowAnim} className={`row ${t.status === 'done' ? 'is-done' : ''}`} onClick={() => setEditing(t)}>
                    <div className="row__text">
                      <div className="row__title">{t.title}</div>
                      <div className="meta">{[roomName(t.room_id) ?? 'Hela hemmet', t.cost ? kr(t.cost) : null].filter(Boolean).join(' · ')}</div>
                      {blocked.length > 0 && <span className="status status--warning">{PHASES[blocked[0].phase].name} är inte klar: {blocked[0].title}</span>}
                      {t.status !== 'done' && <PriorityTag priority={t.priority} />}
                    </div>
                    <button
                      className="status-btn"
                      aria-label={`Ändra status, nu ${LABEL[t.status].toLowerCase()}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        state.patch('tasks', t.id, { status: NEXT[t.status] })
                      }}
                    >
                      <TaskStatusLabel status={t.status} />
                    </button>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      <div className="section">
        <div className="section-head"><h2>Alla faser</h2></div>
        <table className="table">
          <thead>
            <tr><th>Fas</th><th>Jobb</th><th className="num">Kostnad</th></tr>
          </thead>
          <tbody>
            {PHASES.map((p, i) => {
              const pt = tasks.filter((t) => t.phase === i)
              const done = pt.filter((t) => t.status === 'done').length
              return (
                <tr key={p.name} onClick={() => onPhase(i)} style={i === phase ? { background: 'var(--hover)' } : undefined}>
                  <td><strong>{p.name}</strong></td>
                  <td>
                    {pt.length === 0 ? <span className="meta">Inga</span> : done === pt.length ? <span className="status status--won">Klar</span> : <span className="status status--draft">{done} av {pt.length}</span>}
                  </td>
                  <td className="num">{kr(pt.reduce((s, t) => s + t.cost, 0))}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <TaskSheet
        item={editing ?? (adding ? { phase } : null)}
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

export function TaskSheet({ item, defaultRoom, state, onClose }: { item: Task | { phase: number } | null; defaultRoom: string | null; state: ViewProps['state']; onClose: () => void }) {
  const toast = useToast()
  const t = item && 'id' in item ? item : null
  const [f, setF] = useState({ title: '', room_id: '', phase: 0, cost: '', note: '', status: 'todo' as TaskStatus, priority: 2 as Priority, receipt: null as string | null })
  const [receiptUrl, setReceiptUrl] = useState<string | undefined>()

  useEffect(() => {
    if (!item) return
    setF({
      title: t?.title ?? '',
      room_id: t ? t.room_id ?? '' : defaultRoom ?? '',
      phase: item.phase,
      cost: t?.cost ? String(t.cost) : '',
      note: t?.note ?? '',
      status: t?.status ?? 'todo',
      priority: (t?.priority ?? 2) as Priority,
      receipt: t?.receipt_path ?? null,
    })
    setReceiptUrl(t?.receipt_path ? state.urls[t.receipt_path] : undefined)
  }, [item])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const row = { title: f.title.trim(), room_id: f.room_id || null, phase: f.phase, cost: parseNum(f.cost), note: f.note.trim() || null, status: f.status, priority: f.priority, receipt_path: f.receipt }
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
          <input className="input" placeholder="Dra nya eluttag i köket" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required />
        </Field>
        <Field label="Fas">
          <select className="select" value={f.phase} onChange={(e) => setF({ ...f, phase: Number(e.target.value) })}>
            {PHASES.map((p, i) => <option key={p.name} value={i}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Rum">
          <select className="select" value={f.room_id} onChange={(e) => setF({ ...f, room_id: e.target.value })}>
            <option value="">Hela hemmet</option>
            {state.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
        <Field label="Kostnad i kr">
          <input className="input" inputMode="decimal" placeholder="8 500" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} />
        </Field>
        <div className="field">
          <span className="field__label">Status</span>
          <Chips value={f.status} onChange={(s) => setF({ ...f, status: s })} options={(['todo', 'doing', 'done'] as TaskStatus[]).map((s) => ({ value: s, label: LABEL[s] }))} />
        </div>
        <div className="field">
          <span className="field__label">Prio</span>
          <Chips value={f.priority} onChange={(v) => setF({ ...f, priority: v })} options={([1, 2, 3] as Priority[]).map((v) => ({ value: v, label: PRIORITY_LABEL[v] }))} />
        </div>
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
          <textarea className="textarea" rows={3} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </Field>
        <div className="form__actions">
          <Primary>{t ? 'Spara jobb' : 'Lägg till jobb'}</Primary>
          {t && <button type="button" className="btn btn--danger" onClick={del}>Ta bort jobb</button>}
        </div>
      </form>
    </Sheet>
  )
}
