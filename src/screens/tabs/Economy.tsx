import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { emptyEconomy, economyNumbers } from '../../lib/economy'
import { ore, useElPrice } from '../../lib/elpris'
import { kr, parseNum } from '../../lib/format'
import { valuation } from '../../lib/valuation'
import { Chips, Field, Primary, Sheet, useToast } from '../../components/ui'
import { GlassCard } from '../../components/GlassCard'
import { EL_ZONE_LABEL, type Economy, type ElZone } from '../../types'
import type { ProjectState, ViewProps } from '../ProjectView'
import { fmtDate } from './Items'

// Toppkorten och bolånemätaren i Boendeläget.
export function EconomyDashboard({ state, open }: ViewProps) {
  const e = state.project?.economy
  const n = economyNumbers(e ?? emptyEconomy, state.contracts)
  const edit = () => open({ t: 'economy' })
  const el = useElPrice(e?.zone)
  const has = !!e || n.fixed > 0

  return (
    <>
      <div className="kpis kpis--three">
        <GlassCard className="kpi" onClick={edit}>
          <div className="kpi__label">Ren månadskostnad</div>
          <div className="meta">(Ränta och boendeavtal)</div>
          <div className="kpi__value">{has ? kr(n.costs) : '–'}</div>
          <div className="meta">Pengar ut</div>
        </GlassCard>
        <GlassCard className="kpi" onClick={edit}>
          <div className="kpi__label">Ditt sparande</div>
          <div className="meta">(Amortering)</div>
          <div className="kpi__value">{e ? kr(n.saving) : '–'}</div>
          <div className="meta">Pengar in i bostaden</div>
        </GlassCard>
        <GlassCard className="kpi" onClick={edit}>
          <div className="kpi__label">Totalt kassaflöde</div>
          <div className="meta">(Kostnad och amortering)</div>
          <div className="kpi__value">{has ? kr(n.cashflow) : '–'}</div>
          <div className="meta">Varje månad</div>
        </GlassCard>
      </div>

      {e?.zone && el && (
        <GlassCard className="el-price" onClick={edit} lift={false}>
          <div>
            <div className="kpi__label">Elpris nu, {e.zone}</div>
            <div className="kpi__value">{el.now != null ? `${ore(el.now)}/kWh` : '–'}</div>
          </div>
          <div className="meta">
            Snitt i dag {ore(el.avg)}, lägst {ore(el.min)}, högst {ore(el.max)}
            <br />Spotpris utan moms och avgifter
          </div>
        </GlassCard>
      )}

      <div className="eco-grid">
        <GlassCard className="loan" onClick={edit} lift={false}>
          <div className="section-head">
            <h2>Bolån</h2>
            {e?.loan ? <span className="meta">{kr(n.paidOff)} amorterat</span> : null}
          </div>
          {e?.loan ? (
            <>
              <div className="budget-track" aria-hidden>
                <span className="is-spent" style={{ width: `${n.share * 100}%` }} />
              </div>
              <div className="loan__ends">
                <div><div className="meta">Ursprungslån</div><div className="kpi__value">{kr(e.loan)}</div></div>
                <div><div className="meta">Skuld i dag</div><div className="kpi__value">{kr(n.debt)}</div></div>
              </div>
              <p className="meta" style={{ margin: 'var(--s-3) 0 0' }}>
                Ränta {kr(n.interest)}/mån, {kr(n.interestAfter)} efter ränteavdrag
                {e.loanStart ? ` · lånet startade ${fmtDate(e.loanStart)}` : ''}
              </p>
            </>
          ) : (
            <button className="btn btn--secondary" onClick={(ev) => { ev.stopPropagation(); edit() }}>Lägg in bolånet</button>
          )}
        </GlassCard>
        <ValueCard state={state} debt={n.debt} onClick={edit} />
      </div>
    </>
  )
}

// Estimerat marknadsvärde och hur mycket av bostaden som är ens egen.
function ValueCard({ state, debt, onClick }: { state: ProjectState; debt: number; onClick: () => void }) {
  const v = valuation(state.project?.economy, state.rooms)

  return (
    <GlassCard className="loan" onClick={onClick} lift={false}>
      <div className="section-head"><h2>Estimerat marknadsvärde</h2></div>
      {v.value == null ? (
        <>
          <p className="meta" style={{ margin: '0 0 var(--s-3)' }}>Fyll i {v.missing.join(', ')} under Bostaden.</p>
          <button className="btn btn--secondary" onClick={(ev) => { ev.stopPropagation(); onClick() }}>Lägg in bostaden</button>
        </>
      ) : (
        <>
          <div className="kpi__value">{kr(v.value)}</div>
          <p className="meta" style={{ margin: '2px 0 var(--s-4)' }}>
            Baserat på {v.area.toLocaleString('sv-SE')} kvm och rummens nuvarande skick ({v.renovated} av {v.rooms} rum nyrenoverade)
          </p>
          <Margin value={v.value} debt={debt} />
        </>
      )}
    </GlassCard>
  )
}

// Stapeln: bolånet i neutral färg till vänster och din del (övervärdet) i grönt till höger.
function Margin({ value, debt }: { value: number; debt: number }) {
  const margin = value - debt
  const whole = Math.max(value, debt, 1)
  return (
    <>
      <div className="kpi__label">Din totala vinst/marginal</div>
      <div className="split-track" aria-hidden>
        <span className="split-track__debt" style={{ width: `${(Math.min(debt, value) / whole) * 100}%` }} />
        {margin > 0 && <span className="split-track__own" style={{ width: `${(margin / whole) * 100}%` }} />}
      </div>
      <div className="loan__ends">
        <div><div className="meta">Bolån</div><div className="kpi__value">{kr(debt)}</div></div>
        <div>
          <div className="meta">Din del</div>
          <div className={`kpi__value ${margin < 0 ? 'is-negative' : 'is-positive'}`}>{kr(margin)}</div>
        </div>
      </div>
    </>
  )
}

const FIELDS = {
  loan: 'Ursprungligt lån, kr',
  rate: 'Aktuell ränta, %',
  amortization: 'Amortering, kr/mån',
  purchasePrice: 'Inköpspris, kr',
  area: 'Boarea, kvm',
  sqmAverage: 'Snittpris i området, normalt skick, kr/kvm',
  sqmTop: 'Toppris i området, nyrenoverat, kr/kvm',
} as const
type NumKey = keyof typeof FIELDS
const KEYS = Object.keys(FIELDS) as NumKey[]

export function EconomySheet({ open, state, onClose }: { open: boolean; state: ProjectState; onClose: () => void }) {
  const toast = useToast()
  const blank = Object.fromEntries(KEYS.map((k) => [k, ''])) as Record<NumKey, string>
  const [f, setF] = useState({ ...blank, loanStart: '', zone: null as ElZone | null })

  useEffect(() => {
    if (!open) return
    const e = state.project?.economy ?? emptyEconomy
    const s = (n?: number) => (n ? String(n).replace('.', ',') : '')
    setF({ ...(Object.fromEntries(KEYS.map((k) => [k, s(e[k])])) as Record<NumKey, string>), loanStart: e.loanStart ?? '', zone: e.zone ?? null })
  }, [open])

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault()
    const old = state.project?.economy ?? emptyEconomy
    const economy: Economy = {
      ...old,
      loan: parseNum(f.loan), rate: parseNum(f.rate), amortization: parseNum(f.amortization), loanStart: f.loanStart || null, zone: f.zone,
      purchasePrice: parseNum(f.purchasePrice) || undefined, area: parseNum(f.area) || undefined,
      sqmAverage: parseNum(f.sqmAverage) || undefined, sqmTop: parseNum(f.sqmTop) || undefined,
    }
    try {
      await api.updateProject(state.project!.id, { economy })
      await state.reload()
      toast('Ekonomin är sparad')
      onClose()
    } catch (err: any) {
      toast({ title: 'Ekonomin kunde inte sparas', body: err.message })
    }
  }

  const input = (k: NumKey, placeholder: string) => (
    <Field label={FIELDS[k]}>
      <input className="input" inputMode="decimal" placeholder={placeholder} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </Field>
  )

  return (
    <Sheet open={open} onClose={onClose} title="Ekonomi">
      <form className="form" onSubmit={save}>
        <h3 style={{ margin: 0 }}>Bolån</h3>
        {input('loan', '3 000 000')}
        <div className="form__row">
          {input('rate', '3,9')}
          {input('amortization', '5 000')}
        </div>
        <Field label="Lånet startade">
          <input className="input" type="date" value={f.loanStart} onChange={(e) => setF({ ...f, loanStart: e.target.value })} />
        </Field>

        <h3 style={{ margin: 'var(--s-2) 0 0' }}>Bostaden</h3>
        <div className="form__row">
          {input('purchasePrice', '2 950 000')}
          {input('area', '58')}
        </div>
        {input('sqmAverage', '55 000')}
        {input('sqmTop', '68 000')}

        <div className="field">
          <span className="field__label">Elområde</span>
          <Chips value={f.zone} onChange={(z) => setF({ ...f, zone: z === f.zone ? null : z })} options={(Object.keys(EL_ZONE_LABEL) as ElZone[]).map((z) => ({ value: z as ElZone | null, label: EL_ZONE_LABEL[z] }))} />
        </div>
        <p className="meta" style={{ margin: 0 }}>Avgift, el och försäkring räknas från dina boendeavtal under Avtal.</p>

        <div className="form__actions">
          <Primary>Spara</Primary>
        </div>
      </form>
    </Sheet>
  )
}
