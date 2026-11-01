import { useState, type ReactNode } from 'react'
import { IconReceiptOff } from '@tabler/icons-react'
import { kr } from '../../lib/format'
import { paid } from '../../lib/useProject'
import { FileThumb } from '../../components/FileField'
import { PHASES, type Purchase, type Task } from '../../types'
import type { ViewProps } from '../ProjectView'
import { PurchaseSheet } from './Purchases'
import { TaskSheet } from './Timeline'

const fmtDate = (d: string) => new Date(d).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })

type Entry =
  | { kind: 'purchase'; item: Purchase; date: string; amount: number; receipt: string | null }
  | { kind: 'task'; item: Task; date: string; amount: number; receipt: string | null }

export function Receipts({ state, room, q, adding, setAdding, filter }: ViewProps & { filter: ReactNode }) {
  const [editPurchase, setEditPurchase] = useState<Purchase | null>(null)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const match = (r: { room_id: string | null; title: string }) => (room === null || r.room_id === room) && r.title.toLowerCase().includes(q.toLowerCase())

  const entries: Entry[] = [
    ...state.purchases.filter((p) => p.bought && match(p)).map((p) => ({ kind: 'purchase' as const, item: p, date: p.bought_on ?? p.created_at, amount: paid(p), receipt: p.receipt_path })),
    ...state.tasks.filter((t) => t.status === 'done' && t.cost > 0 && match(t)).map((t) => ({ kind: 'task' as const, item: t, date: t.created_at, amount: t.cost, receipt: t.receipt_path })),
  ].sort((a, b) => b.date.localeCompare(a.date))

  const total = entries.reduce((s, e) => s + e.amount, 0)
  const stays = entries.filter((e) => e.kind === 'task' || e.item.stays).reduce((s, e) => s + e.amount, 0)
  const missing = entries.filter((e) => !e.receipt).length
  const roomName = (id: string | null) => state.rooms.find((r) => r.id === id)?.name

  return (
    <div>
      <div className="section-head">
        <h1>Kvitton</h1>
        {filter}
      </div>

      <div className="section">
        <div className="kpis">
          <div className="kpi"><div className="meta">Följer med lägenheten</div><div className="kpi__value">{kr(stays)}</div></div>
          <div className="kpi"><div className="meta">Mitt</div><div className="kpi__value">{kr(total - stays)}</div></div>
        </div>
        {missing > 0 && <div className="budget-status"><span className="status status--warning">{missing} köp saknar kvitto</span></div>}
      </div>

      {entries.length === 0 ? (
        <div className="empty">
          <h2>Inga kvitton än</h2>
          <button className="btn btn--secondary" onClick={() => setAdding(true)}>Lägg till kvitto</button>
        </div>
      ) : (
        <div className="section">
          <div className="section-head">
            <h2>Köpt och gjort</h2>
            <span className="row__amount">{kr(total)}</span>
          </div>
          <div className="rows">
            {entries.map((e) => (
              <div key={e.item.id} className="row" onClick={() => (e.kind === 'purchase' ? setEditPurchase(e.item) : setEditTask(e.item))}>
                <div className="row__main">
                  {e.receipt ? <FileThumb path={e.receipt} url={state.urls[e.receipt]} /> : <span className="thumb" style={{ width: 40, height: 40 }}><IconReceiptOff size={18} /></span>}
                  <div className="row__text">
                    <div className="row__title">{e.item.title}</div>
                    <div className="meta">
                      {[fmtDate(e.date), e.kind === 'purchase' ? e.item.store : PHASES[e.item.phase]?.name, roomName(e.item.room_id)].filter(Boolean).join(' · ')}
                    </div>
                    {!e.receipt && <span className="status status--warning">Kvitto saknas</span>}
                  </div>
                </div>
                <span className="row__amount">{kr(e.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <PurchaseSheet
        item={editPurchase ?? (adding ? 'new' : null)}
        receiptMode={!editPurchase}
        title={editPurchase ? undefined : 'Nytt kvitto'}
        defaultRoom={room}
        state={state}
        onClose={() => {
          setEditPurchase(null)
          setAdding(false)
        }}
      />
      <TaskSheet item={editTask} defaultRoom={room} state={state} onClose={() => setEditTask(null)} />
    </div>
  )
}
