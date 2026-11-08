import { motion, useReducedMotion } from 'framer-motion'
import { IconAlertTriangle, IconArrowRight, IconHammer, IconSmartHome, IconWallet } from '@tabler/icons-react'
import { StatCard } from '../../components/StatCard'
import { Counter } from '../../components/Counter'
import { grow } from '../../components/Charts'
import { emptyEconomy, economyNumbers } from '../../lib/economy'
import { kr } from '../../lib/format'
import type { ProjectState, ViewProps } from '../view'
import { allItems, byImportance, renovationItems, sum, type Item } from '../../lib/items'
import { careWarnings, type Care } from './ProjectHub'
import { ReviewCard } from './Review'
import { TodoCard } from './Todos'
import { QuickEntryCard } from './QuickEntry'

// ---------------------------------------------------------------------------
// Idag: startsidan med det viktigaste från Ekonomi och Hemmet. Kvar i månaden som det stora orangea kortet,
// Att granska när AI:n var osäker, renoveringen (Aktivt projekt), underhållet (Hemmets status), Snabb inmatning
// och Att göra. Korten tonar in och glider upp ett i taget.
// ---------------------------------------------------------------------------
export function Today({ state, open, care, onRoom, onCare }: ViewProps & { care: Care[]; onRoom: (id: string) => void; onCare: () => void }) {
  const still = useReducedMotion()
  const items = renovationItems(state)
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
        <motion.div {...cell(1, 'project')}><ActiveProject state={state} items={items} open={open} onRoom={onRoom} /></motion.div>
        <motion.div {...cell(2, 'status')}><HomeStatus care={care} onCare={onCare} /></motion.div>
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

  return (
    <StatCard tone="accent" className="leftcard" icon={IconWallet} label={income > 0 ? `Kvar i ${monthName}` : `Köpt i ${monthName}`} value={<Counter value={income > 0 ? left : spent} />} onOpen={() => open({ t: 'budget' })}>
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

// Rummet som renoveras just nu: det med planerade saker där något senast blev klart (annars flest planerade).
function focusRoom(state: ProjectState, items: Item[]) {
  const rooms = state.rooms
    .map((r) => {
      const mine = items.filter((i) => i.room_id === r.id)
      const planned = mine.filter((i) => !i.done)
      const last = mine.filter((i) => i.done).map((i) => i.date ?? i.created_at).sort().pop() ?? ''
      return { room: r, mine, planned, last }
    })
    .filter((r) => r.planned.length > 0)
    .sort((a, b) => b.last.localeCompare(a.last) || b.planned.length - a.planned.length)
  return rooms[0] ?? null
}

function ActiveProject({ state, items, open, onRoom }: { state: ProjectState; items: Item[]; open: ViewProps['open']; onRoom: (id: string) => void }) {
  const still = useReducedMotion()
  const f = focusRoom(state, items)
  // Hur långt det har kommit: klart i kronor av allt i rummet, eller i antal om inget har pris.
  const total = f ? sum(f.mine) : 0
  const share = !f ? 0 : total > 0 ? sum(f.mine.filter((i) => i.done)) / total : f.mine.filter((i) => i.done).length / f.mine.length
  const next = f ? [...f.planned].sort(byImportance)[0] : null
  // Projektbudgeten (Budget i kr under Inställningar) mot allt som är klart i renoveringen.
  const budget = Number(state.project?.budget) || 0
  const spent = sum(items.filter((i) => i.done))
  const used = budget > 0 ? spent / budget : 0

  return (
    <StatCard className="focus" icon={IconHammer} label="Aktivt projekt" onOpen={() => (f ? onRoom(f.room.id) : open({ t: 'stat', title: 'Planerat' }))}>
      <div className="focus__top">
        <div className="focus__body">
          <span className="meta">Fokusområde</span>
          <span className="focus__name">{f ? f.room.name : 'Inget på gång'}</span>
        </div>
        {budget > 0 && (
          <div className={`focus__budget ${used > 1 ? 'is-over' : ''}`}>
            <span className="meta">Projektbudget</span>
            <span className="focus__budget-num"><b>{kr(spent)}</b> av {kr(budget)}</span>
            <div className="focus__budget-track" role="progressbar" aria-label="Hur mycket av budgeten som är använd" aria-valuenow={Math.round(used * 100)} aria-valuemin={0} aria-valuemax={100}>
              <motion.div className="focus__budget-bar" initial={still ? false : { width: 0 }} animate={{ width: `${Math.min(100, Math.max(used > 0 ? 3 : 0, used * 100))}%` }} transition={{ ...grow, delay: grow.delay + 0.1 }} />
            </div>
          </div>
        )}
      </div>
      {f && (
        <>
          <div className="focus__progress">
            <div className="focus__track" role="progressbar" aria-label="Hur långt rummet har kommit" aria-valuenow={Math.round(share * 100)} aria-valuemin={0} aria-valuemax={100}>
              <motion.div className="focus__bar" initial={still ? false : { width: 0 }} animate={{ width: `${Math.max(share > 0 ? 3 : 0, share * 100)}%` }} transition={grow} />
            </div>
            <span className="focus__pct">{Math.round(share * 100)} %</span>
          </div>
          {next && (
            <div className="focus__next">
              <IconArrowRight size={15} stroke={2} />
              <span>Nästa steg: <b>{next.title}</b></span>
            </div>
          )}
        </>
      )}
    </StatCard>
  )
}

// Smarta hemmet: det som snart behöver skötas med en orange ikon, och en grön pulserande prick för resten.
function HomeStatus({ care, onCare }: { care: Care[]; onCare: () => void }) {
  const warn = careWarnings(care).slice(0, 2)
  const calm = care.length - careWarnings(care).length
  return (
    <StatCard className="homestatus" icon={IconSmartHome} label="Hemmets status" onOpen={() => { onCare(); setTimeout(() => document.getElementById('care')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 450) }}>
      <div className="homestatus__list">
        {warn.map((c) => (
          <div key={c.id} className="homestatus__row is-warn">
            <span className="homestatus__icon"><IconAlertTriangle size={16} stroke={2} /></span>
            <span><b>{c.thing}:</b> {c.todo}</span>
          </div>
        ))}
        {calm > 0 && (
          <div className="homestatus__row">
            <span className="homestatus__dot" aria-hidden />
            <span>{warn.length ? 'Allt annat rullar' : 'Allt rullar'}</span>
          </div>
        )}
      </div>
    </StatCard>
  )
}
