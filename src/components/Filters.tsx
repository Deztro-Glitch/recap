import { IconAdjustmentsHorizontal, IconSearch } from '@tabler/icons-react'
import type { ProjectState } from '../screens/ProjectView'

export type Flag = 'all' | 'stays' | 'k6'
export interface FilterState { q: string; room: string; flag: Flag }
export const noFilter: FilterState = { q: '', room: '', flag: 'all' }
export const isFiltered = (f: FilterState) => !!(f.q || f.room || f.flag !== 'all')

// På mobilen ligger sök och filter bakom en knapp vid rubriken, så att listan kommer direkt.
export function FilterToggle({ open, active, onClick }: { open: boolean; active: boolean; onClick: () => void }) {
  return (
    <button className={`btn btn--ghost filter-toggle ${active ? 'is-active' : ''}`} aria-label="Sök och filtrera" aria-expanded={open} onClick={onClick}>
      <IconAdjustmentsHorizontal size={20} />
    </button>
  )
}

// Sökfält, rum och märkning på en rad. Rummen är desamma som på planritningen.
export function FilterBar({ state, value, onChange, placeholder, open }: { state: ProjectState; value: FilterState; onChange: (f: FilterState) => void; placeholder: string; open: boolean }) {
  return (
    <div className={`filter-bar ${open ? 'is-open' : ''}`}>
      <label className="search" style={{ maxWidth: 'none' }}>
        <IconSearch size={16} />
        <input value={value.q} onChange={(e) => onChange({ ...value, q: e.target.value })} placeholder={placeholder} aria-label="Sök" />
      </label>
      <select className="select" value={value.room} onChange={(e) => onChange({ ...value, room: e.target.value })} aria-label="Rum">
        <option value="">Rum: Alla</option>
        {state.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
      <select className="select" value={value.flag} onChange={(e) => onChange({ ...value, flag: e.target.value as Flag })} aria-label="Märkning">
        <option value="all">Visa: Allt</option>
        <option value="stays">Följer med lägenheten</option>
        <option value="k6">Värdehöjande (K6)</option>
      </select>
    </div>
  )
}

// Om en rad passar filtret. Texten är allt man kan söka på (titel, butik, färgkod …).
export function matches(f: FilterState, row: { room_id: string | null; stays: boolean; k6: boolean; text: string }) {
  if (f.room && row.room_id !== f.room) return false
  if (f.flag === 'stays' && !row.stays) return false
  if (f.flag === 'k6' && !row.k6) return false
  const words = f.q.toLowerCase().split(/\s+/).filter(Boolean)
  return words.every((w) => row.text.includes(w))
}
