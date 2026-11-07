import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { api } from '../../lib/api'
import { emptyEconomy, economyNumbers } from '../../lib/economy'
import { ore, useElPrice } from '../../lib/elpris'
import { parseNum } from '../../lib/format'
import { valuation } from '../../lib/valuation'
import { Chips, Field, Primary, Sheet, useToast } from '../../components/ui'
import { StatCard } from '../../components/StatCard'
import { IconArrowsExchange, IconBolt, IconBuildingBank, IconHomeDollar, IconPigMoney, IconReceipt2 } from '@tabler/icons-react'
import { Counter } from '../../components/Counter'
import { EL_ZONE_LABEL, type Economy, type ElZone } from '../../types'
import type { ProjectState, ViewProps } from '../ProjectView'

// Staplarna glider ut från noll när kortet visas.
const grow = { duration: 1.1, ease: [0.2, 0.8, 0.2, 1] as const, delay: 0.15 }

// Statistikkorten i Boendeläget: rubrik med ikon och en siffra. Detaljerna finns i Ekonomi (tryck på ett kort).
export function EconomyDashboard({ state, open }: ViewProps) {
  const e = state.project?.economy
  const n = economyNumbers(e ?? emptyEconomy, state.contracts)
  const edit = () => open({ t: 'economy' })
  // Korten öppnar sin detaljvy. Därifrån når man Ekonomi-formuläret.
  const detail = (title: string) => () => open({ t: 'stat', title, economy: true })
  const el = useElPrice(e?.zone)
  const has = !!e || n.fixed > 0

  return (
    <>
      <div className="kpis kpis--three">
        <StatCard icon={IconReceipt2} label="Ren månadskostnad" value={has ? <Counter value={n.costs} /> : '–'} onOpen={detail('Ren månadskostnad')} />
        <StatCard icon={IconPigMoney} label="Ditt sparande" value={e ? <Counter value={n.saving} /> : '–'} onOpen={detail('Ditt sparande')} />
        <StatCard icon={IconArrowsExchange} label="Totalt kassaflöde" value={has ? <Counter value={n.cashflow} /> : '–'} onOpen={detail('Totalt kassaflöde')} />
      </div>

      <div className="eco-grid">
        {e?.zone && el && (
          <StatCard icon={IconBolt} label={`Elpris nu, ${e.zone}`} value={el.now != null ? <Counter value={el.now} format={(v) => `${ore(v)}/kWh`} /> : '–'} onOpen={detail(`Elpris nu, ${e.zone}`)} />
        )}
        <StatCard icon={IconBuildingBank} label="Bolån" value={e?.loan ? <Counter value={n.debt} /> : '–'} onOpen={detail('Bolån')}>
          {e?.loan ? (
            <div className="budget-track" aria-label={`${Math.round(n.share * 100)} % av lånet kvar`}>
              <motion.span className="is-spent" initial={{ width: 0 }} animate={{ width: `${n.share * 100}%` }} transition={grow} />
            </div>
          ) : (
            <button className="btn btn--secondary" onClick={(ev) => { ev.stopPropagation(); edit() }}>Lägg in bolånet</button>
          )}
        </StatCard>
        <ValueCard state={state} debt={n.debt} onOpen={detail('Estimerat marknadsvärde')} onEdit={edit} />
      </div>
    </>
  )
}

// Estimerat marknadsvärde. Märkningen och stapeln visar din del: värdet minus bolånet.
function ValueCard({ state, debt, onOpen, onEdit }: { state: ProjectState; debt: number; onOpen: () => void; onEdit: () => void }) {
  const v = valuation(state.project?.economy, state.rooms)
  if (v.value == null) {
    return (
      <StatCard icon={IconHomeDollar} label="Estimerat marknadsvärde" value="–" onOpen={onOpen}>
        <button className="btn btn--secondary" onClick={(ev) => { ev.stopPropagation(); onEdit() }}>Lägg in bostaden</button>
      </StatCard>
    )
  }
  const margin = v.value - debt
  const whole = Math.max(v.value, debt, 1)
  return (
    <StatCard
      icon={IconHomeDollar}
      label="Estimerat marknadsvärde"
      value={<Counter value={v.value} />}
      badge={<span className={margin < 0 ? 'is-negative' : 'is-positive'} title="Din del: värdet minus bolånet">{margin > 0 ? '+' : ''}<Counter value={margin} /></span>}
      onOpen={onOpen}
    >
      <div className="split-track" aria-label="Bolån och din del av värdet">
        <motion.span className="split-track__debt" initial={{ width: 0 }} animate={{ width: `${(Math.min(debt, v.value) / whole) * 100}%` }} transition={grow} />
        {margin > 0 && <motion.span className="split-track__own" initial={{ width: 0 }} animate={{ width: `${(margin / whole) * 100}%` }} transition={{ ...grow, delay: grow.delay + 0.35 }} />}
      </div>
    </StatCard>
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
