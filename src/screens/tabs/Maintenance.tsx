import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { CARE_SUGGESTIONS } from '../../lib/care'
import { parseNum } from '../../lib/format'
import { Chips, Field, Primary, Sheet, useToast } from '../../components/ui'
import type { Maintenance } from '../../types'
import type { ProjectState } from '../view'
import { RoomSelect } from './Items'

type Unit = 'days' | 'weeks' | 'months'
const UNIT_DAYS: Record<Unit, number> = { days: 1, weeks: 7, months: 30 }
const UNIT_LABEL: Record<Unit, string> = { days: 'Dagar', weeks: 'Veckor', months: 'Månader' }
// Intervallet visas i den största enhet som går jämnt ut: 90 dagar blir 3 månader.
const toUnit = (days: number): { n: string; unit: Unit } =>
  days % 30 === 0 ? { n: String(days / 30), unit: 'months' } : days % 7 === 0 ? { n: String(days / 7), unit: 'weeks' } : { n: String(days), unit: 'days' }

// Ett underhåll: vad, hur ofta, när det senast gjordes, i vilket rum och vilken vitvara.
// Nya får förslag på vanliga sysslor som fyller i namn och intervall.
export function MaintenanceSheet({ item, state, onClose }: { item: Maintenance | Partial<Maintenance> | null; state: ProjectState; onClose: () => void }) {
  const toast = useToast()
  const existing = item?.id ? state.maintenance.find((m) => m.id === item.id) ?? null : null
  const today = new Date().toISOString().slice(0, 10)
  const [f, setF] = useState({ name: '', n: '3', unit: 'months' as Unit, last: today, room_id: '', appliance: '' })

  useEffect(() => {
    if (!item) return
    const u = toUnit(item.every_days ?? 90)
    setF({ name: item.name ?? '', n: u.n, unit: u.unit, last: item.last_done ?? today, room_id: item.room_id ?? '', appliance: item.appliance ?? '' })
  }, [item])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const every = Math.max(1, Math.round(parseNum(f.n) * UNIT_DAYS[f.unit]))
    const row = { name: f.name.trim(), every_days: every, last_done: f.last || null, room_id: f.room_id || null, appliance: f.appliance.trim() || null }
    try {
      if (existing) await api.update('maintenance', existing.id, row)
      else await api.insert('maintenance', { ...row, project_id: state.project!.id })
      await state.reload()
      toast(existing ? 'Underhållet är sparat' : `${row.name} är tillagt`)
      onClose()
    } catch (err: any) {
      toast({ title: 'Underhållet kunde inte sparas', body: err.message })
    }
  }
  const del = async () => {
    if (!existing) return
    await api.remove('maintenance', existing.id)
    await state.reload()
    toast(`${existing.name} är borttaget`)
    onClose()
  }
  // Förslagen som redan finns visas inte igen.
  const taken = new Set(state.maintenance.map((m) => m.name.toLowerCase()))
  const suggestions = CARE_SUGGESTIONS.filter((s) => !taken.has(s.name.toLowerCase()))

  return (
    <Sheet open={!!item} onClose={onClose} title={existing ? existing.name : 'Nytt underhåll'}>
      <form className="form" onSubmit={save}>
        {!existing && suggestions.length > 0 && (
          <div className="chips care-suggest">
            {suggestions.map((s) => (
              <button key={s.name} type="button" className={`chip ${f.name === s.name ? 'is-active' : ''}`}
                onClick={() => setF({ ...f, name: s.name, ...((u) => ({ n: u.n, unit: u.unit }))(toUnit(s.every)) })}>{s.name}</button>
            ))}
          </div>
        )}
        <Field label="Vad">
          <input className="input" placeholder="Byta filter i köksfläkten" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
        </Field>
        <div className="form__row">
          <Field label="Hur ofta">
            <input className="input" inputMode="numeric" value={f.n} onChange={(e) => setF({ ...f, n: e.target.value })} required />
          </Field>
          <Field label="Senast gjort">
            <input className="input" type="date" value={f.last} onChange={(e) => setF({ ...f, last: e.target.value })} />
          </Field>
        </div>
        <Chips value={f.unit} onChange={(unit) => setF({ ...f, unit })} options={(['days', 'weeks', 'months'] as Unit[]).map((u) => ({ value: u, label: UNIT_LABEL[u] }))} />
        <div className="form__row">
          <Field label="Rum">
            <RoomSelect state={state} value={f.room_id} onChange={(v) => setF({ ...f, room_id: v })} />
          </Field>
          <Field label="Vitvara">
            <input className="input" placeholder="Bosch SMS4HVI33E" value={f.appliance} onChange={(e) => setF({ ...f, appliance: e.target.value })} />
          </Field>
        </div>
        <div className="form__actions">
          <Primary>{existing ? 'Spara' : 'Lägg till'}</Primary>
          {existing && <button type="button" className="btn btn--danger" onClick={del}>Ta bort</button>}
        </div>
      </form>
    </Sheet>
  )
}
