import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { api } from '../../lib/api'
import { afterDeduction, emptyEconomy, loanNumbers, monthsSince } from '../../lib/economy'
import { kr, parseNum } from '../../lib/format'
import { Field, Primary, Sheet, useToast } from '../../components/ui'
import { Counter } from '../../components/Counter'
import { grow } from '../../components/Charts'
import type { ProjectState } from '../view'

const amount = (n?: number) => (n ? Math.round(n).toLocaleString('sv-SE') : '')
const percent = (n?: number) => (n ? String(n).replace('.', ',') : '')

// Bolånet: skulden i dag överst, uppgifterna under och räntekalkylatorn längst ner.
// Allt räknas om medan man skriver: skulden = ursprungligt lån − amortering × hela månader sedan start,
// och räntan för månaden räknas på den skulden, före och efter ränteavdraget.
export function MortgageSheet({ open, state, onClose }: { open: boolean; state: ProjectState; onClose: () => void }) {
  const toast = useToast()
  const still = useReducedMotion()
  const [f, setF] = useState({ loan: '', loanStart: '', amortization: '', rate: '' })

  useEffect(() => {
    if (!open) return
    const e = state.project?.economy ?? emptyEconomy
    setF({ loan: amount(e.loan), loanStart: e.loanStart ?? '', amortization: amount(e.amortization), rate: percent(e.rate) })
  }, [open])

  const loan = parseNum(f.loan)
  const n = loanNumbers({ loan, amortization: parseNum(f.amortization), rate: parseNum(f.rate), loanStart: f.loanStart || null })
  const months = f.loanStart ? monthsSince(f.loanStart) : 0
  const paid = loan > 0 ? n.paidOff / loan : 0
  const net = afterDeduction(n.interest)
  const yearly = n.interest * 12

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault()
    const old = state.project?.economy ?? emptyEconomy
    try {
      await api.updateProject(state.project!.id, {
        economy: { ...old, loan, loanStart: f.loanStart || null, amortization: parseNum(f.amortization), rate: parseNum(f.rate) },
      })
      await state.reload()
      toast('Bolånet är sparat')
      onClose()
    } catch (err: any) {
      toast({ title: 'Bolånet kunde inte sparas', body: err.message })
    }
  }

  const set = (k: keyof typeof f) => (ev: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: ev.target.value })

  return (
    <Sheet open={open} onClose={onClose} title="Bolån" wide>
      <form className="form mortgage" onSubmit={save}>
        <div className="mortgage__debt" aria-live="polite">
          <span className="meta">Din aktuella skuld</span>
          <b className="mortgage__big">{loan > 0 ? <Counter value={n.debt} duration={0.5} /> : '–'}</b>
          {loan > 0 && (
            <>
              <div className="mortgage__bar" role="img" aria-label={`${Math.round(paid * 100)} % av lånet amorterat`}>
                <motion.span initial={still ? false : { width: 0 }} animate={{ width: `${paid * 100}%` }} transition={{ ...grow, delay: 0 }} />
              </div>
              <span className="meta">
                {kr(n.paidOff)} amorterat på {months} {months === 1 ? 'månad' : 'månader'} · {Math.round(paid * 100)} % av {kr(loan)}
              </span>
            </>
          )}
        </div>

        <Field label="Ursprungligt lånebelopp (kr)">
          <input className="input" inputMode="numeric" placeholder="1 800 000" value={f.loan} onChange={set('loan')} />
        </Field>
        <div className="form__row">
          <Field label="Lånets startdatum">
            <input className="input" type="date" value={f.loanStart} onChange={set('loanStart')} />
          </Field>
          <Field label="Månadsamortering (kr)">
            <input className="input" inputMode="numeric" placeholder="3 000" value={f.amortization} onChange={set('amortization')} />
          </Field>
        </div>
        <Field label="Aktuell ränta (%)">
          <input className="input" inputMode="decimal" placeholder="3,9" value={f.rate} onChange={set('rate')} />
        </Field>

        <div className="calc" aria-live="polite">
          <div className="calc__head">
            <span className="meta">Räntekostnad denna månad</span>
            <b className="calc__big">{n.interest > 0 ? kr(net) : '–'}</b>
            {n.interest > 0 && <span className="meta">efter ränteavdrag</span>}
          </div>
          {n.interest > 0 && (
            <dl className="calc__rows">
              <div><dt className="meta">Före ränteavdrag</dt><dd>{kr(n.interest)}</dd></div>
              <div><dt className="meta">Ränteavdrag ({yearly > 100_000 ? '30 % / 21 %' : '30 %'})</dt><dd>−{kr(n.interest - net)}</dd></div>
              <div className="calc__sum"><dt>Efter ränteavdrag</dt><dd>{kr(net)}</dd></div>
            </dl>
          )}
        </div>

        <div className="form__actions">
          <Primary>Spara</Primary>
        </div>
      </form>
    </Sheet>
  )
}
