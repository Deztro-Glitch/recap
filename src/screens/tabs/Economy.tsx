import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { costParts, durationText, emptyEconomy, economyNumbers } from '../../lib/economy'
import { ore, useElPrice } from '../../lib/elpris'
import { kr } from '../../lib/format'
import { Chips, Primary, Sheet, useToast } from '../../components/ui'
import { StatCard } from '../../components/StatCard'
import { IconArrowsExchange, IconBolt, IconBuildingBank, IconCreditCard, IconReceipt2 } from '@tabler/icons-react'
import { TodoCard } from './Todos'
import { QuickEntryCard } from './QuickEntry'
import { Counter } from '../../components/Counter'
import { Gauge, MiniBars, PriceMeter, Ring, Segmented, type Bar } from '../../components/Charts'
import { allItems } from './Items'
import { EL_ZONE_LABEL, type ElZone, type Scope } from '../../types'
import type { ProjectState, ViewProps } from '../ProjectView'

// Boendeläget, appens hubb: bolånet som stort kort, kassaflödet med flikar och stapeldiagram, ett kort per annat lån
// (t.ex. MC-lånet), Ren månadskostnad, Elpris och Att göra. Varje kort öppnar sin detaljvy; därifrån når man Ekonomi.
export function EconomyDashboard({ state, open }: ViewProps) {
  const e = state.project?.economy
  const n = economyNumbers(e ?? emptyEconomy, state.contracts)
  const el = useElPrice(e?.zone)
  const has = !!e || n.fixed > 0

  return (
    <div className="eco-dash">
      <MortgageCard state={state} onOpen={() => open({ t: 'mortgage' })} />
      <FlowCard state={state} has={has} onOpen={() => open({ t: 'budget' })} />
      <StatCard className="eco-dash__cost" icon={IconReceipt2} label="Ren månadskostnad" value={has ? <Counter value={n.net} /> : '–'} onOpen={() => open({ t: 'cost' })} />
      {e?.zone && el && (
        <StatCard
          className="eco-dash__el"
          icon={IconBolt}
          label={`Elpris nu, ${e.zone}`}
          badge={el.share != null ? (el.share < 1 / 3 ? 'Billigt' : el.share > 2 / 3 ? 'Dyrt' : 'Normalt') : undefined}
          value={el.now != null ? <Counter value={el.now} format={(v) => `${ore(v)}/kWh`} /> : '–'}
          onOpen={() => open({ t: 'el' })}
        >
          {el.share != null && <PriceMeter share={el.share} label={`${ore(el.now!)} nu, dagens lägsta ${ore(el.min)} och högsta ${ore(el.max)}`} />}
        </StatCard>
      )}
      <OtherLoansCard state={state} onOpen={(id) => open({ t: 'loans', id })} />
      <TodoCard state={state} />
      <QuickEntryCard state={state} />
    </div>
  )
}

// Övriga lån (MC, bil …) i ett kort. Finns flera bläddrar man med prickarna längst ner.
// Kortet öppnar lånepanelen, där man redigerar det visade lånet eller lägger till ett nytt.
function OtherLoansCard({ state, onOpen }: { state: ProjectState; onOpen: (id: string | null) => void }) {
  const loans = economyNumbers(state.project?.economy ?? emptyEconomy, state.contracts).others
  const [at, setAt] = useState(0)
  const l = loans[Math.min(at, loans.length - 1)]

  if (!l) {
    return (
      <StatCard className="eco-dash__loans" icon={IconCreditCard} label="Övriga lån" value="–" onOpen={() => onOpen(null)}>
        <button className="btn btn--secondary" onClick={(ev) => { ev.stopPropagation(); onOpen(null) }}>Lägg in ett lån</button>
      </StatCard>
    )
  }
  const pct = l.paid != null ? Math.round(l.paid * 100) : null
  return (
    <StatCard
      className="eco-dash__loans"
      icon={IconCreditCard}
      label="Övriga lån"
      badge={<span title={l.name}>{l.name.split(',')[0]}</span>}
      value={<Counter key={l.id} value={l.debt} />}
      onOpen={() => onOpen(l.id)}
    >
      <div className="loan-mini">
        {pct != null && <Ring key={l.id} share={l.paid!} size={56} label={`${pct} % av ${l.name} betalt`} />}
        <div className="loan-mini__text">
          <span className="meta">Skuldfri om</span>
          <b>{durationText(l.months)}</b>
          {l.paidOff != null && <span className="meta">{kr(l.paidOff)} amorterat</span>}
        </div>
      </div>
      {loans.length > 1 && (
        <div className="dots" role="tablist" aria-label="Lån" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          {loans.map((x, i) => (
            <button key={x.id} type="button" role="tab" aria-selected={x.id === l.id} aria-label={x.name} className={`dots__dot ${x.id === l.id ? 'is-active' : ''}`} onClick={() => setAt(i)} />
          ))}
        </div>
      )}
    </StatCard>
  )
}

// Kassaflödet med två flikar. Fasta utgifter: räntor, avtal, amorteringar och lånens avgifter per månad.
// Rörligt (Leva): det som köpts till boendet de senaste sex månaderna, från inköpen och kvittoraderna.
// Projektets köp hör till Projektläget och blandas inte in här. Finns inget köpt än visas gråa platshållarstaplar.
type FlowTab = 'fixed' | 'home'
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
const GHOST = [38, 62, 30, 78, 52, 44]

function monthBars(state: ProjectState, scope: Scope) {
  const now = new Date()
  const months = Array.from({ length: 6 }, (_, i) => new Date(now.getFullYear(), now.getMonth() - 5 + i, 1))
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  const sums = new Map<string, number>()
  for (const it of allItems(state)) {
    if (!it.done || it.scope !== scope || !it.date) continue
    sums.set(it.date.slice(0, 7), (sums.get(it.date.slice(0, 7)) ?? 0) + it.amount)
  }
  const bars: Bar[] = months.map((d, i) => ({ label: MONTHS[d.getMonth()], amount: sums.get(key(d)) ?? 0, tone: i === 5 ? 'accent' : undefined }))
  return { bars, thisMonth: bars[5].amount, any: bars.some((b) => b.amount > 0), month: MONTHS[now.getMonth()] }
}

function FlowCard({ state, has, onOpen }: { state: ProjectState; has: boolean; onOpen: () => void }) {
  const [tab, setTab] = useState<FlowTab>('fixed')
  const e = state.project?.economy ?? emptyEconomy
  const n = economyNumbers(e, state.contracts)

  let value: React.ReactNode = '–'
  let badge: React.ReactNode
  let chart: React.ReactNode = null
  if (tab === 'fixed') {
    const bars: Bar[] = [
      ...costParts(e, state.contracts),
      ...(n.saving > 0 ? [{ label: 'Amortering', amount: n.saving, tone: 'accent' as const }] : []),
      ...n.others.filter((l) => l.monthly > 0).map((l) => ({ label: l.name.split(',')[0], amount: l.monthly })),
    ]
    if (has) value = <Counter value={n.cashflow} />
    badge = 'per månad'
    if (bars.length) chart = <MiniBars key="fixed" bars={bars} />
  } else {
    const m = monthBars(state, 'home')
    value = <Counter value={m.thisMonth} />
    badge = `i ${m.month}`
    chart = m.any
      ? <MiniBars key="home" bars={m.bars} />
      : <MiniBars key="home-ghost" ghost bars={m.bars.map((b, i) => ({ ...b, amount: GHOST[i] }))} />
  }

  return (
    <StatCard
      className="eco-dash__flow"
      icon={IconArrowsExchange}
      label="Kassaflöde"
      badge={badge}
      top={<Segmented label="Visa" value={tab} onChange={setTab} options={[{ value: 'fixed', label: 'Fasta utgifter' }, { value: 'home', label: 'Rörligt (Leva)' }]} />}
      value={value}
      onOpen={onOpen}
    >
      {chart}
    </StatCard>
  )
}

// Bolånet: mätaren visar låneresan. Hela bågen är ursprungslånet, den gröna delen är amorterat och
// den mörka delen är skulden i dag. Kortet öppnar bolånepanelen (Mortgage.tsx).
function MortgageCard({ state, onOpen }: { state: ProjectState; onOpen: () => void }) {
  const e = state.project?.economy
  const n = economyNumbers(e ?? emptyEconomy, state.contracts)
  const paid = e?.loan ? n.paidOff / e.loan : 0
  const pct = Math.round(paid * 100)

  return (
    <StatCard
      className="eco-dash__hero"
      tone="accent"
      icon={IconBuildingBank}
      label="Bolån"
      badge={e?.loan ? <span className="is-positive">{pct < 1 && paid > 0 ? '<1' : pct} % betalt</span> : undefined}
      onOpen={onOpen}
    >
      {e?.loan ? (
        <>
          <Gauge share={paid} label={`${kr(n.paidOff)} av ${kr(e.loan)} amorterat, ${kr(n.debt)} kvar`}>
            <div className="kpi__value"><Counter value={n.debt} /></div>
            <div className="meta">kvar av {kr(e.loan)}</div>
          </Gauge>
          <div className="hero__legend">
            <div><i className="dot dot--own" /><span className="meta">Amorterat</span><b><Counter value={n.paidOff} /></b></div>
            <div><i className="dot dot--debt" /><span className="meta">Aktuell skuld</span><b><Counter value={n.debt} /></b></div>
          </div>
        </>
      ) : (
        <div className="hero__empty">
          <button className="btn btn--secondary" onClick={(ev) => { ev.stopPropagation(); onOpen() }}>Lägg in bolånet</button>
        </div>
      )}
    </StatCard>
  )
}

// Ekonomi: elområdet för dagens spotpris. Bolånet redigeras i bolånepanelen (kortet Bolån) och
// avgift, el och försäkring kommer från boendeavtalen under Avtal.
export function EconomySheet({ open, state, onClose }: { open: boolean; state: ProjectState; onClose: () => void }) {
  const toast = useToast()
  const [zone, setZone] = useState<ElZone | null>(null)

  useEffect(() => {
    if (open) setZone(state.project?.economy?.zone ?? null)
  }, [open])

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault()
    const old = state.project?.economy ?? emptyEconomy
    try {
      await api.updateProject(state.project!.id, { economy: { ...old, zone } })
      await state.reload()
      toast('Ekonomin är sparad')
      onClose()
    } catch (err: any) {
      toast({ title: 'Ekonomin kunde inte sparas', body: err.message })
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Ekonomi">
      <form className="form" onSubmit={save}>
        <div className="field">
          <span className="field__label">Elområde</span>
          <Chips value={zone} onChange={(z) => setZone(z === zone ? null : z)} options={(Object.keys(EL_ZONE_LABEL) as ElZone[]).map((z) => ({ value: z as ElZone | null, label: EL_ZONE_LABEL[z] }))} />
        </div>
        <p className="meta" style={{ margin: 0 }}>Avgift, el och försäkring räknas från dina boendeavtal under Avtal.</p>

        <div className="form__actions">
          <Primary>Spara</Primary>
        </div>
      </form>
    </Sheet>
  )
}
