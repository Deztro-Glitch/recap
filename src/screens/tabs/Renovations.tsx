import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { IconHammer } from '@tabler/icons-react'
import { api } from '../../lib/api'
import { kr, parseNum } from '../../lib/format'
import { allItems, byDate, byImportance, renovationNumbers, sum } from '../../lib/items'
import { GlassCard } from '../../components/GlassCard'
import { grow } from '../../components/Charts'
import { Chips, Field, Primary, Sheet, useToast } from '../../components/ui'
import { RENOVATION_STATUS_LABEL, type Renovation, type RenovationStatus } from '../../types'
import type { ProjectState, ViewProps } from '../view'
import { ItemList, useMarkDone } from './Items'

const month = (d: string) => new Date(d).toLocaleDateString('sv-SE', { month: 'short', year: 'numeric' })
const period = (r: Pick<Renovation, 'starts_on' | 'ends_on'>) =>
  r.starts_on && r.ends_on ? `${month(r.starts_on)} – ${month(r.ends_on)}` : r.starts_on ? `Från ${month(r.starts_on)}` : r.ends_on ? `Klart ${month(r.ends_on)}` : null

// Budgetstapeln: klart mot budgeten, röd över budget. Utan budget visas bara vad som är klart.
function BudgetBar({ spent, budget, delay = 0 }: { spent: number; budget: number; delay?: number }) {
  const still = useReducedMotion()
  const used = budget > 0 ? spent / budget : 0
  return (
    <div className={`reno__budget ${used > 1 ? 'is-over' : ''}`}>
      <span className="reno__budget-num"><b>{kr(spent)}</b>{budget > 0 ? ` av ${kr(budget)}` : ' klart'}</span>
      {budget > 0 && (
        <div className="reno__track" role="progressbar" aria-label="Hur mycket av budgeten som är använd" aria-valuenow={Math.round(used * 100)} aria-valuemin={0} aria-valuemax={100}>
          <motion.div className="reno__bar" initial={still ? false : { width: 0 }} animate={{ width: `${Math.min(100, Math.max(used > 0 ? 3 : 0, used * 100))}%` }} transition={{ ...grow, delay: grow.delay + delay }} />
        </div>
      )}
    </div>
  )
}

// Projekten överst i Hemmet: ett ljust glaskort per projekt med status, rum, period och budget.
// Pågående först, sedan planerade och sist de som är klara. Nya projekt läggs till via Lägg till.
export function RenovationStrip({ state, open }: ViewProps) {
  const order: Record<RenovationStatus, number> = { active: 0, planned: 1, done: 2 }
  const list = [...state.renovations].sort((a, b) => order[a.status] - order[b.status])
  if (!list.length) return null
  const roomNames = (ids: string[]) => ids.map((id) => state.rooms.find((r) => r.id === id)?.name).filter(Boolean).join(' · ')
  return (
    <div className="reno-strip">
      {list.map((r, i) => {
        const n = renovationNumbers(state, r)
        return (
          <motion.div key={r.id} className="reno-strip__cell" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: i * 0.05 }}>
            <GlassCard className={`kpi glass--light reno-card is-${r.status}`} onClick={() => open({ t: 'renovation', item: r })}>
              <div className="kpi__head">
                <span className="kpi__icon"><IconHammer size={16} stroke={1.8} /></span>
                <span className="kpi__label">{r.name}</span>
                <span className="kpi__badge">{RENOVATION_STATUS_LABEL[r.status]}</span>
              </div>
              <span className="meta reno-card__meta">{[roomNames(r.room_ids), period(r)].filter(Boolean).join(' · ') || `${n.items.length} saker`}</span>
              <BudgetBar spent={n.spent} budget={n.budget} delay={i * 0.05} />
            </GlassCard>
          </motion.div>
        )
      })}
    </div>
  )
}

// Ett projekt: hur det går (klart mot budget, planerat kvar), det som hör till projektet och sist uppgifterna.
// Renoveringsköp som inte hör till något projekt föreslås, så att de kan läggas till med ett tryck.
export function RenovationSheet({ item, state, open, onClose }: { item: Renovation | Partial<Renovation> | null; state: ProjectState; open: ViewProps['open']; onClose: () => void }) {
  const toast = useToast()
  const { markDone, field } = useMarkDone(state)
  const existing = item?.id ? state.renovations.find((r) => r.id === item.id) ?? null : null
  const blank = { name: '', status: 'active' as RenovationStatus, budget: '', starts_on: '', ends_on: '', room_ids: [] as string[] }
  const [f, setF] = useState(blank)

  useEffect(() => {
    if (!item) return
    setF({
      name: item.name ?? '',
      status: item.status ?? 'active',
      budget: item.budget ? String(item.budget) : '',
      starts_on: item.starts_on ?? '',
      ends_on: item.ends_on ?? '',
      room_ids: item.room_ids ?? [],
    })
  }, [item])

  const n = existing ? renovationNumbers(state, existing) : null
  // Renovering utan projekt: förslag att lägga till här.
  const loose = existing ? allItems(state).filter((i) => i.scope === 'build' && !i.renovation_id).sort(byDate) : []

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const row = {
      name: f.name.trim(), status: f.status, budget: f.budget.trim() ? parseNum(f.budget) : null,
      starts_on: f.starts_on || null, ends_on: f.ends_on || null, room_ids: f.room_ids,
    }
    try {
      if (existing) await api.update('renovations', existing.id, row)
      else await api.insert('renovations', { ...row, project_id: state.project!.id })
      await state.reload()
      toast(existing ? 'Projektet är sparat' : `${row.name} är tillagt`)
      onClose()
    } catch (err: any) {
      toast({ title: 'Projektet kunde inte sparas', body: err.message })
    }
  }
  const del = async () => {
    if (!existing || !confirm(`Ta bort ${existing.name}? Köpen och jobben blir kvar, utan projekt.`)) return
    await api.remove('renovations', existing.id)
    await state.reload()
    toast(`${existing.name} är borttaget`)
    onClose()
  }
  const link = async (id: string, table: 'purchases' | 'tasks') => {
    await api.update(table, id, table === 'purchases' ? { renovation_id: existing!.id, scope: 'build' } : { renovation_id: existing!.id })
    await state.reload()
  }
  const toggleRoom = (id: string) => setF((c) => ({ ...c, room_ids: c.room_ids.includes(id) ? c.room_ids.filter((x) => x !== id) : [...c.room_ids, id] }))

  return (
    <Sheet open={!!item} onClose={onClose} title={existing ? existing.name : 'Nytt projekt'} wide>
      {field}
      {n && existing && (
        <div className="reno-sum">
          <BudgetBar spent={n.spent} budget={n.budget} />
          <dl className="facts">
            <div><dt className="meta">Planerat kvar</dt><dd>{kr(n.plannedSum)}</dd></div>
            <div><dt className="meta">Klart</dt><dd>{n.done.length} av {n.items.length}</dd></div>
            {n.budget > 0 && <div><dt className="meta">{n.budget - n.spent >= 0 ? 'Kvar av budgeten' : 'Över budget'}</dt><dd>{kr(Math.abs(n.budget - n.spent))}</dd></div>}
          </dl>
        </div>
      )}

      {n && (
        <>
          <div className="section">
            <div className="section-head"><h3>Planerat</h3><span className="meta">{kr(n.plannedSum)}</span></div>
            <ItemList items={[...n.planned].sort(byImportance)} state={state} open={open} onCheck={markDone} empty="Inget planerat" />
          </div>
          <div className="section">
            <div className="section-head"><h3>Klart</h3><span className="meta">{kr(n.spent)}</span></div>
            <ItemList items={[...n.done].sort(byDate)} state={state} open={open} empty="Inget klart än" />
          </div>
          {loose.length > 0 && (
            <div className="section">
              <div className="section-head"><h3>Renovering utan projekt</h3><span className="meta">{kr(sum(loose))}</span></div>
              <div className="rows reno-loose">
                {loose.slice(0, 12).map((it) => (
                  <div key={it.id} className="row">
                    <div className="row__text">
                      <div className="row__title">{it.title}</div>
                      <div className="meta">{[it.date && new Date(it.date).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }), state.rooms.find((r) => r.id === it.room_id)?.name].filter(Boolean).join(' · ')}</div>
                    </div>
                    {it.amount > 0 && <span className="row__amount">{kr(it.amount)}</span>}
                    <button type="button" className="btn btn--secondary" onClick={() => link(it.id, it.table)}>Koppla</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      {existing && <div className="section-head reno-form-head"><h3>Uppgifter</h3></div>}
      <form className="form" onSubmit={save}>
        <Field label="Namn">
          <input className="input" placeholder="Köksrenovering" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
        </Field>
        <Chips value={f.status} onChange={(status) => setF({ ...f, status })} options={(['planned', 'active', 'done'] as RenovationStatus[]).map((v) => ({ value: v, label: RENOVATION_STATUS_LABEL[v] }))} />
        <Field label="Budget">
          <input className="input" inputMode="numeric" placeholder="150 000" value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })} />
        </Field>
        <div className="form__row">
          <Field label="Start">
            <input className="input" type="date" value={f.starts_on} onChange={(e) => setF({ ...f, starts_on: e.target.value })} />
          </Field>
          <Field label="Klart">
            <input className="input" type="date" value={f.ends_on} onChange={(e) => setF({ ...f, ends_on: e.target.value })} />
          </Field>
        </div>
        {state.rooms.length > 0 && (
          <div className="field">
            <span className="field__label">Rum</span>
            <div className="chips">
              {state.rooms.map((r) => (
                <button key={r.id} type="button" className={`chip ${f.room_ids.includes(r.id) ? 'is-active' : ''}`} onClick={() => toggleRoom(r.id)}>{r.name}</button>
              ))}
            </div>
          </div>
        )}
        <div className="form__actions">
          <Primary>{existing ? 'Spara' : 'Lägg till'}</Primary>
          {existing && <button type="button" className="btn btn--danger" onClick={del}>Ta bort</button>}
        </div>
      </form>
    </Sheet>
  )
}
