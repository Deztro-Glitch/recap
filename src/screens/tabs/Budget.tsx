import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { api } from '../../lib/api'
import { monthBudget, monthLabel, overBudget, shiftMonth, transactions, type BudgetRow, type Category } from '../../lib/budget'
import { emptyEconomy } from '../../lib/economy'
import { kr, parseNum } from '../../lib/format'
import { Field, Sheet, useToast } from '../../components/ui'
import { Counter } from '../../components/Counter'
import { Donut, grow } from '../../components/Charts'
import type { ProjectState } from '../view'
import { allItems } from '../../lib/items'

const txt = (n?: number) => (n ? Math.round(n).toLocaleString('sv-SE') : '')
const day = (d: string) => new Date(d).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
const thisMonth = () => new Date().toISOString().slice(0, 7)

// Budgeten: lönen (netto) är 100 %. Ringen visar vad varje kategori har kostat och hålet vad som är kvar.
// Under den en rad per kategori med en egen budget (sparas när man lämnar fältet) och vad som är kvar eller över.
// Pilarna bläddrar mellan månaderna, så att varje månad blir en månadsrapport. Bara riktiga siffror.
export function BudgetSheet({ open, state, onClose }: { open: boolean; state: ProjectState; onClose: () => void }) {
  const toast = useToast()
  const still = useReducedMotion()
  const e = state.project?.economy ?? emptyEconomy
  const now = thisMonth()
  const [month, setMonth] = useState(now)
  const [income, setIncome] = useState('')
  const [drafts, setDrafts] = useState<Partial<Record<Category, string>>>({})

  useEffect(() => {
    if (!open) return
    setIncome(txt(state.project?.economy?.income))
    setMonth(thisMonth())
    setDrafts({})
  }, [open])

  const pay = parseNum(income)
  const items = allItems(state)
  // Man kan bläddra tillbaka till den första månaden med ett köp.
  const first = items.filter((i) => i.done && i.date).map((i) => i.date!.slice(0, 7)).sort()[0] ?? now
  const rows = monthBudget(e, state, items, month)
  const spent = rows.reduce((s, r) => s + r.spent, 0)
  const left = pay - spent
  const over = overBudget(rows)
  const budgeted = rows.filter((r) => !r.fixed && r.budget > 0)
  const recent = transactions(items, state.receipts, month).slice(0, 8)
  const name = monthLabel(month).split(' ')[0]

  const saveEconomy = async (patch: Partial<typeof e>, what: string) => {
    if (!state.project) return
    try {
      await api.updateProject(state.project.id, { economy: { ...e, ...patch } })
      await state.reload()
    } catch (err: any) {
      toast({ title: `${what} kunde inte sparas`, body: err.message })
    }
  }
  // Lönen och budgetarna sparas när man lämnar fältet eller trycker Enter.
  const saveIncome = async () => {
    setIncome(txt(pay))
    if (pay !== (state.project?.economy?.income ?? 0)) await saveEconomy({ income: pay || undefined }, 'Lönen')
  }
  const saveBudget = async (k: Category) => {
    const raw = drafts[k]
    if (raw === undefined) return
    const v = parseNum(raw)
    setDrafts((d) => ({ ...d, [k]: undefined }))
    if (v === (Number(e.budgets?.[k]) || 0)) return
    await saveEconomy({ budgets: { ...e.budgets, [k]: v || undefined } }, 'Budgeten')
  }

  return (
    <Sheet open={open} onClose={onClose} title="Budget" wide>
      <div className="budget">
        <div className="budget__month">
          <button type="button" className="btn btn--ghost" aria-label="Förra månaden" disabled={month <= first} onClick={() => setMonth(shiftMonth(month, -1))}><IconChevronLeft size={18} /></button>
          <h3>{monthLabel(month)[0].toUpperCase() + monthLabel(month).slice(1)}</h3>
          <button type="button" className="btn btn--ghost" aria-label="Nästa månad" disabled={month >= now} onClick={() => setMonth(shiftMonth(month, 1))}><IconChevronRight size={18} /></button>
        </div>

        <form className="budget__income" onSubmit={(ev) => { ev.preventDefault(); (document.activeElement as HTMLElement)?.blur() }}>
          <Field label="Månadslön (netto)">
            <div className="budget__pay">
              <input className="input" inputMode="numeric" placeholder="32 000" value={income} onChange={(ev) => setIncome(ev.target.value)} onBlur={saveIncome} />
              <span className="budget__unit">kr</span>
            </div>
          </Field>
        </form>

        <Donut
          key={month}
          slices={rows.filter((r) => r.spent > 0).map((r) => ({ key: r.key, label: r.label, amount: r.spent, color: r.color }))}
          total={pay}
          label={rows.filter((r) => r.spent > 0).map((r) => `${r.label} ${kr(r.spent)}`).join(', ')}
        >
          <span className="meta">Kvar</span>
          <b className={`donut__value ${pay > 0 && left < 0 ? 'is-negative' : ''}`}>{pay > 0 ? <Counter value={left} /> : '–'}</b>
          {pay > 0 && <span className="meta">av {kr(pay)}</span>}
        </Donut>

        {/* Månadsrapporten i en mening: vad som gick över, eller att allt höll sig inom budget. */}
        {budgeted.length > 0 && (
          <p className={`budget__verdict ${over.length ? 'is-over' : ''}`}>
            {over.length
              ? `${over.map((r) => r.label).join(' och ')} ${month === now ? 'är' : 'gick'} över budget i ${name}.`
              : `Allt ${month === now ? 'är' : 'höll sig'} inom budget i ${name}.`}
          </p>
        )}

        <ul className="bcat">
          {rows.map((r, i) => (
            <BudgetLine key={r.key} row={r} delay={i * 0.04}
              draft={drafts[r.key]} onDraft={(v) => setDrafts((d) => ({ ...d, [r.key]: v }))} onSave={() => saveBudget(r.key)} />
          ))}
        </ul>

        <section className="budget__recent">
          <h3>Transaktioner i {name}</h3>
          {recent.length ? (
            // Ny månad = ny lista, så att förra månadens rader inte ligger kvar och tonar ut.
            <ul className="tx-list" key={month}>
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
            <p className="meta">Inget köpt i {name}</p>
          )}
        </section>
      </div>
    </Sheet>
  )
}

// En kategori: vad den har kostat, en stapel mot budgeten och vad som är kvar eller över.
// Rörliga kategorier har ett fält för budgeten; boende och lån är fasta.
function BudgetLine({ row: r, delay, draft, onDraft, onSave }: { row: BudgetRow; delay: number; draft?: string; onDraft: (v: string) => void; onSave: () => void }) {
  const still = useReducedMotion()
  const share = r.budget > 0 ? r.spent / r.budget : 0
  const isOver = !r.fixed && r.budget > 0 && r.spent > r.budget
  const note = r.fixed ? 'Fast varje månad'
    : r.budget > 0 ? (isOver ? `${kr(r.spent - r.budget)} över` : `${kr(r.budget - r.spent)} kvar`)
    : ''
  return (
    <li className={`bcat__row ${isOver ? 'is-over' : ''} ${r.fixed ? 'is-fixed' : ''}`}>
      <i className="bcat__dot" style={{ background: r.color }} />
      <div className="bcat__main">
        <div className="bcat__top">
          <span className="bcat__label">{r.label}</span>
          <b className="bcat__spent">{kr(r.spent)}</b>
        </div>
        {r.budget > 0 && (
          <div className="bcat__track">
            <motion.div className="bcat__bar" style={{ background: isOver ? undefined : r.color }}
              initial={still ? false : { width: 0 }} animate={{ width: `${Math.min(100, Math.max(r.spent > 0 ? 2 : 0, share * 100))}%` }} transition={{ ...grow, delay: grow.delay + delay }} />
          </div>
        )}
        {note && <span className="bcat__note">{note}</span>}
      </div>
      {!r.fixed && (
        <label className="bcat__budget">
          <span className="sr-only">Budget för {r.label}</span>
          <input className="input" inputMode="numeric" placeholder="Budget" value={draft ?? txt(r.budget)}
            onChange={(ev) => onDraft(ev.target.value)} onBlur={onSave} onKeyDown={(ev) => ev.key === 'Enter' && (ev.target as HTMLInputElement).blur()} />
        </label>
      )}
    </li>
  )
}
