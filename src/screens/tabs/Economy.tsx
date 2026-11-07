import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { costParts, emptyEconomy, economyNumbers } from '../../lib/economy'
import { ore, useElPrice } from '../../lib/elpris'
import { kr, parseNum } from '../../lib/format'
import { valuation } from '../../lib/valuation'
import { Chips, Field, Primary, Sheet, useToast } from '../../components/ui'
import { StatCard } from '../../components/StatCard'
import { IconArrowsExchange, IconBolt, IconBuildingBank, IconHomeDollar, IconPigMoney, IconReceipt2 } from '@tabler/icons-react'
import { Counter } from '../../components/Counter'
import { Gauge, MiniBars, type Bar } from '../../components/Charts'
import { EL_ZONE_LABEL, type Economy, type ElZone } from '../../types'
import type { ProjectState, ViewProps } from '../ProjectView'

// Boendeläget: ett stort kort för bolånet med en halvcirkelmätare (och marknadsvärdet som uppskattning), kassaflödet med ett stapeldiagram
// och tre mindre kort. Varje kort öppnar sin detaljvy; därifrån når man Ekonomi-formuläret.
export function EconomyDashboard({ state, open }: ViewProps) {
  const e = state.project?.economy
  const n = economyNumbers(e ?? emptyEconomy, state.contracts)
  const edit = () => open({ t: 'economy' })
  const detail = (title: string) => () => open({ t: 'stat', title, economy: true })
  const el = useElPrice(e?.zone)
  const has = !!e || n.fixed > 0
  const bars: Bar[] = [
    ...costParts(e ?? emptyEconomy, state.contracts),
    ...(n.saving > 0 ? [{ label: 'Amortering', amount: n.saving, tone: 'accent' as const }] : []),
  ]

  return (
    <div className="eco-dash">
      <LoanValueCard state={state} onOpen={detail('Bolån')} onEdit={edit} />

      <StatCard className="eco-dash__flow" icon={IconArrowsExchange} label="Totalt kassaflöde" value={has ? <Counter value={n.cashflow} /> : '–'} onOpen={detail('Totalt kassaflöde')}>
        {bars.length > 0 && <MiniBars bars={bars} />}
      </StatCard>
      <StatCard className="eco-dash__cost" icon={IconReceipt2} label="Ren månadskostnad" value={has ? <Counter value={n.costs} /> : '–'} onOpen={detail('Ren månadskostnad')} />
      <StatCard className="eco-dash__save" icon={IconPigMoney} label="Ditt sparande" value={e ? <Counter value={n.saving} /> : '–'} onOpen={detail('Ditt sparande')} />
      {e?.zone && el && (
        <StatCard className="eco-dash__el" icon={IconBolt} label={`Elpris nu, ${e.zone}`} value={el.now != null ? <Counter value={el.now} format={(v) => `${ore(v)}/kWh`} /> : '–'} onOpen={detail(`Elpris nu, ${e.zone}`)} />
      )}
    </div>
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
          <div className="estimate__row">
            <span className="estimate__value">≈ <Counter value={v.value} /></span>
            {e?.loan ? (
              <span className={`estimate__own ${v.value - n.debt < 0 ? 'is-negative' : ''}`}>
                Din del ≈ {v.value - n.debt > 0 ? '+' : ''}<Counter value={v.value - n.debt} />
              </span>
            ) : null}
          </div>
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
