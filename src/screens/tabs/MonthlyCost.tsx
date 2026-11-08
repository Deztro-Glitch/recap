import { motion, useReducedMotion, type Variants } from 'framer-motion'
import { emptyEconomy, economyNumbers, monthlyCostGroups, type CostGroup } from '../../lib/economy'
import { kr } from '../../lib/format'
import { Sheet } from '../../components/ui'
import { Counter } from '../../components/Counter'
import { grow } from '../../components/Charts'
import type { ProjectState } from '../ProjectView'

// Färg per rad, samma i stapeln och i listan.
const TONE: Record<CostGroup['key'], string> = {
  interest: 'var(--accent)',
  fee: 'var(--accent-hi)',
  running: 'var(--cost-running)',
}

// Raderna tonar in en i taget, efter att panelen har glidit in.
const list: Variants = { hidden: {}, show: { transition: { delayChildren: 0.35, staggerChildren: 0.08 } } }
const row: Variants = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.2, 0.8, 0.2, 1] } } }

// Ren månadskostnad uppdelad: summan stort överst, en tunn stapel med fördelningen och en rad per del
// (ränta efter avdrag, avgift, driftkostnader) med det som ingår i den.
export function MonthlyCostSheet({ open, state, onClose }: { open: boolean; state: ProjectState; onClose: () => void }) {
  const still = useReducedMotion()
  const e = state.project?.economy ?? emptyEconomy
  const total = economyNumbers(e, state.contracts).net
  const groups = monthlyCostGroups(e, state.contracts)
  const share = (g: CostGroup) => (total > 0 ? g.amount / total : 0)

  return (
    <Sheet open={open} onClose={onClose} title="Ren månadskostnad" wide>
      <div className="costsheet">
        <div className="costsheet__total">
          <b className="costsheet__big">{total > 0 ? <Counter value={total} /> : '–'}</b>
          <span className="meta">per månad</span>
        </div>

        {groups.length > 0 && (
          <div className="costbar" role="img" aria-label={groups.map((g) => `${g.label} ${Math.round(share(g) * 100)} %`).join(', ')}>
            {groups.map((g, i) => (
              <motion.span
                key={g.key}
                style={{ background: TONE[g.key] }}
                initial={still ? false : { width: '0%' }}
                animate={{ width: `${share(g) * 100}%` }}
                transition={{ ...grow, delay: 0.25 + i * 0.12 }}
              />
            ))}
          </div>
        )}

        <motion.ul className="costlist" variants={list} initial={still ? false : 'hidden'} animate="show">
          {groups.map((g) => (
            <motion.li key={g.key} className="costrow" variants={row}>
              <div className="costrow__head">
                <i className="costrow__dot" style={{ background: TONE[g.key] }} />
                <span className="costrow__label">{g.label}</span>
                <span className="costrow__pct">{Math.round(share(g) * 100)} %</span>
                <b className="costrow__amount">{kr(g.amount)}</b>
              </div>
              {g.items.length > 0 && (
                <ul className="costrow__items">
                  {g.items.map((x) => (
                    <li key={x.label}><span>{x.label}</span><span>{x.amount < 0 ? `−${kr(-x.amount)}` : kr(x.amount)}</span></li>
                  ))}
                </ul>
              )}
            </motion.li>
          ))}
        </motion.ul>
      </div>
    </Sheet>
  )
}
