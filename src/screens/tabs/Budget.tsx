import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { api } from '../../lib/api'
import { budgetParts, transactions } from '../../lib/budget'
import { emptyEconomy } from '../../lib/economy'
import { kr, parseNum } from '../../lib/format'
import { Field, Sheet, useToast } from '../../components/ui'
import { Counter } from '../../components/Counter'
import { Donut } from '../../components/Charts'
import type { ProjectState } from '../ProjectView'
import { allItems } from './Items'

const txt = (n?: number) => (n ? Math.round(n).toLocaleString('sv-SE') : '')
const day = (d: string) => new Date(d).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })

// Kassaflödet som budget: lönen (netto) är 100 %. Ringen visar hur lönen fördelas på kategorier och
// hålet visar vad som är kvar. Under den en stram lista med de senaste köpen och kvittona.
// Köp läggs in med kortet Snabb inmatning på dashboarden (QuickEntry.tsx).
export function BudgetSheet({ open, state, onClose }: { open: boolean; state: ProjectState; onClose: () => void }) {
  const toast = useToast()
  const still = useReducedMotion()
  const e = state.project?.economy ?? emptyEconomy
  const [income, setIncome] = useState('')

  useEffect(() => {
    if (open) setIncome(txt(state.project?.economy?.income))
  }, [open])

  const pay = parseNum(income)
  const items = allItems(state)
  const parts = budgetParts(pay, e, state, items)
  const spent = parts.reduce((s, p) => s + p.amount, 0)
  const left = pay - spent
  const recent = transactions(items, state.receipts).slice(0, 8)

  // Lönen sparas när man lämnar fältet eller trycker Enter.
  const saveIncome = async () => {
    setIncome(txt(pay))
    if (!state.project || pay === (state.project.economy?.income ?? 0)) return
    try {
      await api.updateProject(state.project.id, { economy: { ...e, income: pay || undefined } })
      await state.reload()
    } catch (err: any) {
      toast({ title: 'Lönen kunde inte sparas', body: err.message })
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Kassaflöde" wide>
      <div className="budget">
        <form className="budget__income" onSubmit={(ev) => { ev.preventDefault(); (document.activeElement as HTMLElement)?.blur() }}>
          <Field label="Månadslön (netto)">
            <div className="budget__pay">
              <input className="input" inputMode="numeric" placeholder="32 000" value={income} onChange={(ev) => setIncome(ev.target.value)} onBlur={saveIncome} />
              <span className="budget__unit">kr</span>
            </div>
          </Field>
        </form>

        <Donut
          slices={parts.map((p) => ({ key: p.key, label: p.label, amount: p.amount, color: p.color }))}
          total={pay}
          label={parts.map((p) => `${p.label} ${kr(p.amount)}`).join(', ')}
        >
          <span className="meta">Kvar</span>
          <b className={`donut__value ${pay > 0 && left < 0 ? 'is-negative' : ''}`}>{pay > 0 ? <Counter value={left} /> : '–'}</b>
          {pay > 0 && <span className="meta">av {kr(pay)}</span>}
        </Donut>

        {parts.length > 0 && (
          <ul className="budget__legend">
            {parts.map((p) => (
              <li key={p.key}>
                <i style={{ background: p.color }} />
                <span>{p.label}</span>
                {pay > 0 && <span className="meta">{Math.round((p.amount / pay) * 100)} %</span>}
                <b>{kr(p.amount)}</b>
              </li>
            ))}
          </ul>
        )}

        <section className="budget__recent">
          <h3>Senaste transaktioner</h3>
          {recent.length ? (
            <ul className="tx-list">
              <AnimatePresence initial={false}>
                {recent.map((t) => (
                  <motion.li
                    key={t.id}
                    layout={!still}
                    className="tx"
                    initial={still ? false : { opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <span className="tx__text">
                      <span className="tx__title" title={t.title}>{t.title}</span>
                      <span className="tx__date">{day(t.date)}</span>
                    </span>
                    <span className="tx__amount">{kr(t.amount)}</span>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          ) : (
            <p className="meta">Inget inlagt än</p>
          )}
        </section>
      </div>
    </Sheet>
  )
}
