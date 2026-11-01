import { IconX } from '@tabler/icons-react'
import { DETAIL_SUGGESTIONS, type Detail } from '../types'

// Fria fält som "Färgkod: NCS S 0502-Y". Tomma rader sparas inte.
export function DetailsField({ value, onChange }: { value: Detail[]; onChange: (v: Detail[]) => void }) {
  const set = (i: number, patch: Partial<Detail>) => onChange(value.map((d, k) => (k === i ? { ...d, ...patch } : d)))
  const used = new Set(value.map((d) => d.label))

  return (
    <div className="field">
      <span className="field__label">Detaljer</span>
      {value.map((d, i) => (
        <div key={i} className="details__row">
          <input className="input" placeholder="Namn" value={d.label} onChange={(e) => set(i, { label: e.target.value })} aria-label="Detaljens namn" />
          <input className="input" placeholder="Värde" value={d.value} onChange={(e) => set(i, { value: e.target.value })} aria-label={d.label || 'Värde'} />
          <button type="button" className="btn btn--ghost" aria-label="Ta bort raden" onClick={() => onChange(value.filter((_, k) => k !== i))}>
            <IconX size={16} />
          </button>
        </div>
      ))}
      <div className="chips">
        {DETAIL_SUGGESTIONS.filter((s) => !used.has(s)).map((s) => (
          <button type="button" key={s} className="chip" onClick={() => onChange([...value, { label: s, value: '' }])}>{s}</button>
        ))}
        <button type="button" className="chip" onClick={() => onChange([...value, { label: '', value: '' }])}>Egen</button>
      </div>
    </div>
  )
}

export const cleanDetails = (d: Detail[]) => {
  const out = d.map((x) => ({ label: x.label.trim(), value: x.value.trim() })).filter((x) => x.label && x.value)
  return out.length ? out : null
}

export function DetailsList({ details }: { details: Detail[] | null }) {
  if (!details?.length) return null
  return <div className="meta">{details.map((d) => `${d.label}: ${d.value}`).join(' · ')}</div>
}
