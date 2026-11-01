import { kr } from '../lib/format'

export function BudgetMeter({ budget, spent, planned }: { budget: number; spent: number; planned: number }) {
  const scale = Math.max(budget, planned, spent, 1)
  const pct = (n: number) => `${(n / scale) * 100}%`
  const overSpent = budget > 0 && spent > budget
  const overPlanned = budget > 0 && planned > budget

  return (
    <div>
      <div className="kpis">
        <div className="kpi">
          <div className="meta">Spenderat</div>
          <div className="kpi__value">{kr(spent)}</div>
        </div>
        <div className="kpi">
          <div className="meta">{budget ? `Planerat av ${kr(budget)}` : 'Planerat'}</div>
          <div className="kpi__value">{kr(planned)}</div>
        </div>
      </div>

      {budget > 0 && (
        <>
          <div className="budget-track" aria-hidden>
            <span className="is-planned" style={{ width: pct(planned) }} />
            <span className={overSpent ? 'is-over' : 'is-spent'} style={{ width: pct(spent) }} />
            {budget < scale && <span className="marker" style={{ left: pct(budget) }} />}
          </div>
          <div className="budget-status">
            {overSpent ? (
              <span className="status status--lost">{kr(spent - budget)} över budget</span>
            ) : overPlanned ? (
              <span className="status status--warning">Planerat ligger {kr(planned - budget)} över budget</span>
            ) : (
              <span className="status status--won">{kr(budget - planned)} kvar att planera</span>
            )}
          </div>
        </>
      )}
    </div>
  )
}
