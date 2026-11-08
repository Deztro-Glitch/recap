import { useEffect, useState } from 'react'
import { IconPlus, IconTrash } from '@tabler/icons-react'
import { api } from '../../lib/api'
import { durationText, emptyEconomy, monthsToDebtFree, otherLoanNumbers } from '../../lib/economy'
import { kr, parseNum } from '../../lib/format'
import { Chips, Field, Primary, Sheet, useToast } from '../../components/ui'
import type { Economy, OtherLoan } from '../../types'
import type { ProjectState } from '../view'
import { today } from '../../lib/items'

// Ett lån medan det redigeras: beloppen som text, som i fälten.
type Draft = { id: string; name: string; debt: string; amortization: string; rate: string; fee: string; loan: string }
const blank = (): Draft => ({ id: crypto.randomUUID(), name: '', debt: '', amortization: '', rate: '', fee: '', loan: '' })
const txt = (n?: number | null) => (n ? String(Math.round(n * 100) / 100).replace('.', ',') : '')
const MONTH = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december']

// Övriga lån (MC, bil …). Man redigerar ett lån i taget och kan lägga till fler.
// Kalkylatorn räknar direkt medan man skriver: tid till skuldfri och vad lånet kostar i månaden.
export function LoansSheet({ open, id, state, onClose }: { open: boolean; id: string | null; state: ProjectState; onClose: () => void }) {
  const toast = useToast()
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [selected, setSelected] = useState<string>('')

  useEffect(() => {
    if (!open) return
    // Skulden visas som den är i dag, så att man kan rätta den mot banken.
    const list = (state.project?.economy?.loans ?? []).map((l) => {
      const n = otherLoanNumbers(l)
      return { id: l.id, name: l.name, debt: txt(n.debt), amortization: txt(l.amortization), rate: txt(l.rate), fee: txt(l.fee), loan: txt(l.loan) }
    })
    const target = id && list.some((d) => d.id === id) ? id : null
    if (target) {
      setDrafts(list)
      setSelected(target)
    } else {
      const fresh = blank()
      setDrafts([...list, fresh])
      setSelected(fresh.id)
    }
  }, [open, id])

  const d = drafts.find((x) => x.id === selected)
  const set = (patch: Partial<Draft>) => setDrafts(drafts.map((x) => (x.id === selected ? { ...x, ...patch } : x)))
  const addNew = () => {
    const fresh = blank()
    setDrafts([...drafts, fresh])
    setSelected(fresh.id)
  }
  const removeSelected = () => {
    const rest = drafts.filter((x) => x.id !== selected)
    setDrafts(rest)
    setSelected(rest[0]?.id ?? '')
  }

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault()
    const old: Economy = state.project?.economy ?? emptyEconomy
    // Tomma rader sparas inte. Skulden räknas från i dag och minskar sedan med amorteringen varje månad.
    const loans: OtherLoan[] = drafts
      .filter((x) => parseNum(x.debt) > 0 || x.name.trim())
      .map((x) => ({
        id: x.id, name: x.name.trim() || 'Lån', debt: parseNum(x.debt), debtDate: today(),
        amortization: parseNum(x.amortization), rate: parseNum(x.rate), fee: parseNum(x.fee) || undefined, loan: parseNum(x.loan) || undefined,
      }))
    try {
      await api.updateProject(state.project!.id, { economy: { ...old, loans } })
      await state.reload()
      toast('Lånen är sparade')
      onClose()
    } catch (err: any) {
      toast({ title: 'Lånen kunde inte sparas', body: err.message })
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Övriga lån">
      <form className="form" onSubmit={save}>
        <div className="loans-pick">
          {drafts.length > 1 && (
            <Chips value={selected} onChange={setSelected} options={drafts.map((x) => ({ value: x.id, label: x.name.trim() || 'Nytt lån' }))} />
          )}
          <button type="button" className="btn btn--secondary" onClick={addNew}><IconPlus size={16} /> Lägg till nytt lån</button>
        </div>

        {d && (
          <>
            <Field label="Namn">
              <input className="input" placeholder="MC-lån, KTM 990 Duke" value={d.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <div className="form__row">
              <Field label="Kvarvarande skuld, kr">
                <input className="input" inputMode="decimal" placeholder="85 000" value={d.debt} onChange={(e) => set({ debt: e.target.value })} />
              </Field>
              <Field label="Månadsamortering, kr">
                <input className="input" inputMode="decimal" placeholder="2 500" value={d.amortization} onChange={(e) => set({ amortization: e.target.value })} />
              </Field>
            </div>
            <div className="form__row">
              <Field label="Ränta, %">
                <input className="input" inputMode="decimal" placeholder="7,9" value={d.rate} onChange={(e) => set({ rate: e.target.value })} />
              </Field>
              <Field label="Fakturaavgift, kr/mån">
                <input className="input" inputMode="decimal" placeholder="49" value={d.fee} onChange={(e) => set({ fee: e.target.value })} />
              </Field>
            </div>
            <Field label="Ursprungligt lån, kr">
              <input className="input" inputMode="decimal" placeholder="120 000" value={d.loan} onChange={(e) => set({ loan: e.target.value })} />
            </Field>

            <Calculator draft={d} />

            <button type="button" className="btn btn--danger" style={{ justifySelf: 'start' }} onClick={removeSelected}>
              <IconTrash size={16} /> Ta bort lånet
            </button>
          </>
        )}

        <div className="form__actions">
          <Primary>Spara</Primary>
        </div>
      </form>
    </Sheet>
  )
}

// Räknar direkt på det man har skrivit: rak amortering, så tiden är skulden delat med amorteringen.
function Calculator({ draft }: { draft: Draft }) {
  const debt = parseNum(draft.debt)
  const amort = parseNum(draft.amortization)
  const months = monthsToDebtFree(debt, amort)
  const interest = (debt * parseNum(draft.rate)) / 100 / 12
  const fee = parseNum(draft.fee)
  const end = months != null && months > 0 ? new Date(new Date().getFullYear(), new Date().getMonth() + months, 1) : null

  return (
    <div className="calc" aria-live="polite">
      <div className="calc__head">
        <span className="meta">Beräknad tid till skuldfri</span>
        <b className="calc__big">{debt > 0 ? durationText(months) : '–'}</b>
        {end && <span className="meta">Skuldfri runt {MONTH[end.getMonth()]} {end.getFullYear()}</span>}
      </div>
      {debt > 0 && (
        <dl className="calc__rows">
          <div><dt className="meta">Ränta</dt><dd>{kr(interest)}</dd></div>
          <div><dt className="meta">Amortering</dt><dd>{kr(Math.min(amort, debt))}</dd></div>
          <div><dt className="meta">Avgift</dt><dd>{kr(fee)}</dd></div>
          <div className="calc__sum"><dt>Per månad</dt><dd>{kr(interest + Math.min(amort, debt) + fee)}</dd></div>
        </dl>
      )}
    </div>
  )
}
