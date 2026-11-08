import { motion, useReducedMotion } from 'framer-motion'
import { IconAlertTriangle, IconArrowRight, IconHammer, IconSmartHome, IconWallet } from '@tabler/icons-react'
import { StatCard } from '../../components/StatCard'
import { Counter } from '../../components/Counter'
import { grow } from '../../components/Charts'
import { emptyEconomy, economyNumbers } from '../../lib/economy'
import { kr } from '../../lib/format'
import type { ViewProps } from '../view'
import { activeRenovation, allItems, renovationNumbers, sum } from '../../lib/items'
import { RENOVATION_STATUS_LABEL } from '../../types'
import { careDue, careItems, warranties, warrantySoon, whenText } from '../../lib/care'
import { monthBudget, overBudget } from '../../lib/budget'
import { ReviewCard } from './Review'
import { TodoCard } from './Todos'
import { QuickEntryCard } from './QuickEntry'

// ---------------------------------------------------------------------------
// Idag: startsidan med det viktigaste från Ekonomi och Hemmet. Kvar i månaden som det stora orangea kortet,
// Att granska när AI:n var osäker, renoveringen (Aktivt projekt), underhållet (Hemmets status), Snabb inmatning
// och Att göra. Korten tonar in och glider upp ett i taget.
// ---------------------------------------------------------------------------
export function Today({ state, open, onCare }: ViewProps & { onCare: () => void }) {
  const still = useReducedMotion()
  const cell = (i: number, area: string) => ({
    className: `today__cell today__${area}`,
    initial: still ? false : { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.3, delay: i * 0.06, ease: [0.2, 0.8, 0.2, 1] as const },
  })
  const date = new Date().toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div>
      <div className="section-head">
        <h1>Idag</h1>
        <span className="meta today__date">{date[0].toUpperCase() + date.slice(1)}</span>
      </div>
      <ReviewCard state={state} open={open} />
      <div className="today">
        <motion.div {...cell(0, 'left')}><LeftCard state={state} open={open} /></motion.div>
        <motion.div {...cell(1, 'project')}><ActiveProject state={state} open={open} /></motion.div>
        <motion.div {...cell(2, 'status')}><HomeStatus state={state} open={open} onCare={onCare} /></motion.div>
        <motion.div {...cell(3, 'quick')}><QuickEntryCard state={state} /></motion.div>
        <motion.div {...cell(4, 'todo')}><TodoCard state={state} /></motion.div>
      </div>
    </div>
  )
}

// Kvar i månaden, bara med riktiga siffror: månadslönen netto minus de fasta utgifterna (räntor, avtal,
// amorteringar, lån) minus vardagens köp den här månaden. Utan lön visas vad som har köpts.
function LeftCard({ state, open }: ViewProps) {
  const still = useReducedMotion()
  const e = state.project?.economy
  const n = economyNumbers(e ?? emptyEconomy, state.contracts)
  const income = Number(e?.income) || 0
  const month = new Date().toISOString().slice(0, 7)
  // Bara vardagens köp: renoveringen har sin egen budget (Aktivt projekt), precis som i budgetpanelen.
  const spent = sum(allItems(state).filter((i) => i.done && i.scope === 'home' && (i.date ?? '').startsWith(month)))
  const left = income - n.cashflow - spent
  const used = income > 0 ? Math.min(1, (n.cashflow + spent) / income) : 0
  const monthName = new Date().toLocaleDateString('sv-SE', { month: 'long' })
  // Kategorier som har gått över sin budget den här månaden syns som en märkning på kortet.
  const over = overBudget(monthBudget(e ?? emptyEconomy, state, allItems(state), month))
  const badge = over.length === 1 ? `${over[0].label} över budget` : over.length > 1 ? `${over.length} över budget` : undefined

  return (
    <StatCard tone="accent" className="leftcard" icon={IconWallet} label={income > 0 ? `Kvar i ${monthName}` : `Köpt i ${monthName}`} badge={badge} value={<Counter value={income > 0 ? left : spent} />} onOpen={() => open({ t: 'budget' })}>
      {income > 0 && (
        <>
          <div className="leftcard__track" role="progressbar" aria-label="Hur mycket av lönen som är använd" aria-valuenow={Math.round(used * 100)} aria-valuemin={0} aria-valuemax={100}>
            <motion.div className="leftcard__bar" initial={still ? false : { width: 0 }} animate={{ width: `${used * 100}%` }} transition={grow} />
          </div>
          <div className="leftcard__parts">
            <span><small>Lön</small><b>{kr(income)}</b></span>
            <span><small>Fasta</small><b>−{kr(n.cashflow)}</b></span>
            <span><small>Köpt</small><b>−{kr(spent)}</b></span>
          </div>
        </>
      )}
    </StatCard>
  )
}

// Projektet som pågår (Hemmet → projekten): namnet, rummen, hur långt det har kommit, budgeten och nästa steg.
// Kortet öppnar projektet. Finns inget projekt öppnar det ett nytt.
function ActiveProject({ state, open }: ViewProps) {
  const still = useReducedMotion()
  const r = activeRenovation(state.renovations)
  const n = r ? renovationNumbers(state, r) : null
  const rooms = r ? r.room_ids.map((id) => state.rooms.find((x) => x.id === id)?.name).filter(Boolean).join(' · ') : ''

  return (
    <StatCard className="focus" icon={IconHammer} label="Aktivt projekt" onOpen={() => open({ t: 'renovation', item: r ?? {} })}>
      <div className="focus__top">
        <div className="focus__body">
          <span className="meta">{r ? rooms || RENOVATION_STATUS_LABEL[r.status] : 'Projekt'}</span>
          <span className="focus__name">{r ? r.name : 'Inget på gång'}</span>
        </div>
        {n && n.budget > 0 && (
          <div className={`focus__budget ${n.used > 1 ? 'is-over' : ''}`}>
            <span className="meta">Budget</span>
            <span className="focus__budget-num"><b>{kr(n.spent)}</b> av {kr(n.budget)}</span>
            <div className="focus__budget-track" role="progressbar" aria-label="Hur mycket av budgeten som är använd" aria-valuenow={Math.round(n.used * 100)} aria-valuemin={0} aria-valuemax={100}>
              <motion.div className="focus__budget-bar" initial={still ? false : { width: 0 }} animate={{ width: `${Math.min(100, Math.max(n.used > 0 ? 3 : 0, n.used * 100))}%` }} transition={{ ...grow, delay: grow.delay + 0.1 }} />
            </div>
          </div>
        )}
      </div>
      {n && n.items.length > 0 && (
        <>
          <div className="focus__progress">
            <div className="focus__track" role="progressbar" aria-label="Hur långt projektet har kommit" aria-valuenow={Math.round(n.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <motion.div className="focus__bar" initial={still ? false : { width: 0 }} animate={{ width: `${Math.max(n.progress > 0 ? 3 : 0, n.progress * 100)}%` }} transition={grow} />
            </div>
            <span className="focus__pct">{Math.round(n.progress * 100)} %</span>
          </div>
          {n.next && (
            <div className="focus__next">
              <IconArrowRight size={15} stroke={2} />
              <span>Nästa steg: <b>{n.next.title}</b></span>
            </div>
          )}
        </>
      )}
    </StatCard>
  )
}

// Hemmets status: underhåll som snart är dags och garantier som snart går ut, med en orange ikon,
// och en grön pulserande prick när resten rullar. Utan underhåll öppnar kortet ett nytt.
function HomeStatus({ state, open, onCare }: ViewProps & { onCare: () => void }) {
  const items = careItems(state)
  const due = careDue(items)
  const soon = warrantySoon(warranties(state))
  const warn = [
    ...due.map((c) => ({ id: c.id, what: c.name, text: whenText(c.left) })),
    ...soon.map((w) => ({ id: w.id, what: w.title, text: w.left <= 0 ? 'Garantin går ut i dag' : `Garantin går ut om ${w.left} dagar` })),
  ].slice(0, 3)
  const calm = items.length - due.length
  const empty = !items.length && !soon.length
  return (
    <StatCard className="homestatus" icon={IconSmartHome} label="Hemmets status"
      onOpen={() => (empty ? open({ t: 'maintenance', item: {} }) : (onCare(), setTimeout(() => document.getElementById('care')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 450)))}>
      <div className="homestatus__list">
        {warn.map((c) => (
          <div key={c.id} className="homestatus__row is-warn">
            <span className="homestatus__icon"><IconAlertTriangle size={16} stroke={2} /></span>
            <span><b>{c.what}:</b> {c.text}</span>
          </div>
        ))}
        {calm > 0 && (
          <div className="homestatus__row">
            <span className="homestatus__dot" aria-hidden />
            <span>{warn.length ? 'Allt annat rullar' : 'Allt rullar'}</span>
          </div>
        )}
        {empty && <span className="meta">Inget underhåll inlagt</span>}
      </div>
    </StatCard>
  )
}
