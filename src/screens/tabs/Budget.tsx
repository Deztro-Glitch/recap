import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { IconArrowUp } from '@tabler/icons-react'
import { api } from '../../lib/api'
import { CATEGORY, budgetParts, guessCategory, readQuickEntry, transactions } from '../../lib/budget'
import { emptyEconomy } from '../../lib/economy'
import { kr, parseNum } from '../../lib/format'
import { Field, Sheet, useToast } from '../../components/ui'
import { Counter } from '../../components/Counter'
import { Donut } from '../../components/Charts'
import type { Purchase } from '../../types'
import type { ProjectState } from '../ProjectView'
import { allItems, today } from './Items'

const txt = (n?: number) => (n ? Math.round(n).toLocaleString('sv-SE') : '')
const day = (d: string) => new Date(d).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })

// Kassaflödet som budget: lönen (netto) är 100 %. Ringen visar hur lönen fördelas på kategorier och
// hålet visar vad som är kvar. Under den lägger man snabbt in ett köp ("Vinglas 699kr").
export function BudgetSheet({ open, state, onClose }: { open: boolean; state: ProjectState; onClose: () => void }) {
  const toast = useToast()
  const still = useReducedMotion()
  const e = state.project?.economy ?? emptyEconomy
  const [income, setIncome] = useState('')
  const [quick, setQuick] = useState('')
  const [sending, setSending] = useState(false)
  const quickRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) setIncome(txt(state.project?.economy?.income))
  }, [open])

  const pay = parseNum(income)
  const items = allItems(state)
  const parts = budgetParts(pay, e, state, items)
  const spent = parts.reduce((s, p) => s + p.amount, 0)
  const left = pay - spent
  const recent = transactions(items).slice(0, 6)

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

  // Snabbinmatning. Läses på enheten tills AI:n är på plats; köpet sparas som ett klart boendeköp,
  // så att det också syns i Inköp och i kassaflödets Rörligt (Leva).
  const addQuick = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!state.project || sending || !quick.trim()) return
    const entry = readQuickEntry(quick)
    if (!entry) {
      toast('Skriv ett belopp, t.ex. Vinglas 699 kr')
      return
    }
    setSending(true)
    try {
      await api.insert<Purchase>('purchases', {
        project_id: state.project.id, room_id: null, title: entry.title, est_price: 0, price: entry.amount,
        bought: true, bought_on: today(), scope: 'home', priority: 2, stays: false, k6: false,
        store: null, link: null, note: null, details: null, receipt_path: null, image_path: null,
      })
      await state.reload()
      setQuick('')
      quickRef.current?.focus()
    } catch (err: any) {
      toast({ title: 'Köpet kunde inte sparas', body: err.message })
    } finally {
      setSending(false)
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

        <form className="quick" onSubmit={addQuick}>
          <input
            ref={quickRef}
            className="quick__input"
            placeholder="Snabb inmatning (t.ex. Vinglas 699kr)"
            aria-label="Snabb inmatning"
            enterKeyHint="send"
            value={quick}
            onChange={(ev) => setQuick(ev.target.value)}
          />
          <button className="quick__send" type="submit" aria-label="Skicka" disabled={!quick.trim() || sending}>
            <IconArrowUp size={18} stroke={2.4} />
          </button>
        </form>

        <section className="budget__recent">
          <h3>Senaste transaktioner</h3>
          {recent.length ? (
            <ul className="tx-list">
              <AnimatePresence initial={false}>
                {recent.map((t) => {
                  const c = CATEGORY[guessCategory(t.title)]
                  return (
                    <motion.li
                      key={t.id}
                      layout={!still}
                      className="tx"
                      initial={still ? false : { opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <i className="tx__dot" style={{ background: c.color }} />
                      <span className="tx__text">
                        <span className="tx__title">{t.title}</span>
                        <span className="meta">{c.label} · {day(t.date!)}</span>
                      </span>
                      <b className="tx__amount">−{kr(t.amount)}</b>
                    </motion.li>
                  )
                })}
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
