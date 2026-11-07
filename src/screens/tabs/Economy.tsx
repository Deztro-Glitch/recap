import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { costParts, durationText, emptyEconomy, economyNumbers } from '../../lib/economy'
import { ore, useElPrice } from '../../lib/elpris'
import { kr, parseNum } from '../../lib/format'
import { valuation } from '../../lib/valuation'
import { Chips, Field, Primary, Sheet, useToast } from '../../components/ui'
import { StatCard } from '../../components/StatCard'
import { IconArrowsExchange, IconBolt, IconBuildingBank, IconCreditCard, IconHomeDollar, IconReceipt2 } from '@tabler/icons-react'
import { TodoCard } from './Todos'
import { Counter } from '../../components/Counter'
import { Gauge, MiniBars, Ring, Segmented, type Bar } from '../../components/Charts'
import { allItems } from './Items'
import { EL_ZONE_LABEL, type Economy, type ElZone, type Scope } from '../../types'
import type { ProjectState, ViewProps } from '../ProjectView'

// Boendeläget, appens hubb: bolånet som stort kort, kassaflödet med flikar och stapeldiagram, ett kort per annat lån
// (t.ex. MC-lånet), Ren månadskostnad, Elpris och Att göra. Varje kort öppnar sin detaljvy; därifrån når man Ekonomi.
export function EconomyDashboard({ state, open }: ViewProps) {
  const e = state.project?.economy
  const n = economyNumbers(e ?? emptyEconomy, state.contracts)
  const edit = () => open({ t: 'economy' })
  const detail = (title: string) => () => open({ t: 'stat', title, economy: true })
  const el = useElPrice(e?.zone)
  const has = !!e || n.fixed > 0

  return (
    <div className="eco-dash">
      <LoanValueCard state={state} onOpen={detail('Bolån')} onEdit={edit} />
      <FlowCard state={state} has={has} onOpen={detail('Kassaflöde')} />
      <StatCard className="eco-dash__cost" icon={IconReceipt2} label="Ren månadskostnad" value={has ? <Counter value={n.costs} /> : '–'} onOpen={detail('Ren månadskostnad')} />
      {e?.zone && el && (
        <StatCard className="eco-dash__el" icon={IconBolt} label={`Elpris nu, ${e.zone}`} value={el.now != null ? <Counter value={el.now} format={(v) => `${ore(v)}/kWh`} /> : '–'} onOpen={detail(`Elpris nu, ${e.zone}`)} />
      )}
      <OtherLoansCard state={state} onOpen={(id) => open({ t: 'loans', id })} />
      <TodoCard state={state} />
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

// Det stora kortet handlar om lånet, som är fakta: mätaren är hela ursprungslånet, fylld med det som är amorterat.
// Marknadsvärdet är en uppskattning och ligger därför för sig, tydligt märkt, under mätaren.
function LoanValueCard({ state, onOpen, onEdit }: { state: ProjectState; onOpen: () => void; onEdit: () => void }) {
  const e = state.project?.economy
  const n = economyNumbers(e ?? emptyEconomy, state.contracts)
  const v = valuation(e, state.rooms)
  const paid = e?.loan ? n.paidOff / e.loan : 0
  const pct = Math.round(paid * 100)
  const ask = (text: string) => <button className="btn btn--secondary" onClick={(ev) => { ev.stopPropagation(); onEdit() }}>{text}</button>

  return (
    <StatCard
      className="eco-dash__hero"
      icon={IconBuildingBank}
      label="Bolån"
      badge={e?.loan ? <span className="is-positive">{pct < 1 && paid > 0 ? '<1' : pct} % betalt</span> : undefined}
      onOpen={onOpen}
    >
      {e?.loan ? (
        <>
          <Gauge share={paid} label={`${pct} % av lånet amorterat`}>
            <div className="kpi__value"><Counter value={n.debt} /></div>
            <div className="meta">kvar av {kr(e.loan)}</div>
          </Gauge>
          <div className="hero__legend">
            <div><i className="dot dot--own" /><span className="meta">Amorterat</span><b><Counter value={n.paidOff} /></b></div>
            <div><i className="dot dot--debt" /><span className="meta">Skuld</span><b><Counter value={n.debt} /></b></div>
          </div>
        </>
      ) : (
        <div className="hero__empty">{ask('Lägg in bolånet')}</div>
      )}

      <div className="estimate">
        <div className="estimate__head">
          <IconHomeDollar size={15} stroke={1.8} />
          <span>Marknadsvärde</span>
          <span className="estimate__tag">Uppskattning</span>
        </div>
        {v.value != null ? (
          <>
            <div className="estimate__row">
              <span className="estimate__value">≈ <Counter value={v.value} /></span>
              {e?.loan ? (
                <span className={`estimate__own ${v.value - n.debt < 0 ? 'is-negative' : ''}`}>
                  Din del (Insats + Vinst) ≈ {v.value - n.debt > 0 ? '+' : ''}<Counter value={v.value - n.debt} />
                </span>
              ) : null}
            </div>
            {e?.purchasePrice ? <div className="estimate__sub">Inköpspris: {kr(e.purchasePrice)}</div> : null}
          </>
        ) : (
          ask('Lägg in bostaden')
        )}
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
