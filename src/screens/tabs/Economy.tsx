import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { costParts, emptyEconomy, economyNumbers } from '../../lib/economy'
import { ore, useElPrice } from '../../lib/elpris'
import { kr, parseNum } from '../../lib/format'
import { valuation } from '../../lib/valuation'
import { Chips, Field, Primary, Sheet, useToast } from '../../components/ui'
import { StatCard } from '../../components/StatCard'
import { IconArrowsExchange, IconBolt, IconBuildingBank, IconHomeDollar, IconMotorbike, IconPlus, IconReceipt2, IconTrash } from '@tabler/icons-react'
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
      <div className="eco-dash__loans">
        {n.others.length ? (
          n.others.map((l) => <OtherLoanCard key={l.id} loan={l} onOpen={detail(l.name)} />)
        ) : (
          <StatCard icon={IconMotorbike} label="MC-lån" value="–" onOpen={detail('MC-lån')}>
            <button className="btn btn--secondary" onClick={(ev) => { ev.stopPropagation(); edit() }}>Lägg in lånet</button>
          </StatCard>
        )}
      </div>
      <TodoCard state={state} />
    </div>
  )
}

// Ett annat lån (t.ex. MC-lånet): skulden som siffra och en ring som visar hur mycket som är betalt.
function OtherLoanCard({ loan, onOpen }: { loan: ReturnType<typeof economyNumbers>['others'][number]; onOpen: () => void }) {
  const pct = Math.round(loan.paid * 100)
  return (
    <StatCard icon={IconMotorbike} label={loan.name} value={<Counter value={loan.debt} />} badge={<span className="is-positive">{pct} % betalt</span>} onOpen={onOpen}>
      <div className="loan-mini">
        <Ring share={loan.paid} size={56} label={`${pct} % av ${loan.name} betalt`} />
        <div className="loan-mini__text">
          <span className="meta">Amorterat</span>
          <b><Counter value={loan.paidOff} /></b>
          <span className="meta">av {kr(loan.loan)}</span>
        </div>
      </div>
    </StatCard>
  )
}

// Kassaflödet med flikar. Fasta utgifter: räntor, boendeavtal och amorteringar per månad.
// Boende (rörligt) och Projekt: det som köpts de senaste sex månaderna, från inköpen (och kvittoraderna) i
// respektive del. Finns inget köpt än visas gråa platshållarstaplar.
type FlowTab = 'fixed' | 'home' | 'build'
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
    const m = monthBars(state, tab)
    value = <Counter value={m.thisMonth} />
    badge = `i ${m.month}`
    chart = m.any
      ? <MiniBars key={tab} bars={m.bars} />
      : <MiniBars key={tab + '-ghost'} ghost bars={m.bars.map((b, i) => ({ ...b, amount: GHOST[i] }))} />
  }

  return (
    <StatCard
      className="eco-dash__flow"
      icon={IconArrowsExchange}
      label="Kassaflöde"
      badge={badge}
      top={<Segmented label="Visa" value={tab} onChange={setTab} options={[{ value: 'fixed', label: 'Fasta utgifter' }, { value: 'home', label: 'Boende (Rörligt)' }, { value: 'build', label: 'Projekt' }]} />}
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

// Ett annat lån medan det redigeras: beloppen som text, som i fälten.
type LoanDraft = { id: string; name: string; loan: string; amortization: string; rate: string; loanStart: string }
const blankLoan = (): LoanDraft => ({ id: crypto.randomUUID(), name: '', loan: '', amortization: '', rate: '', loanStart: '' })

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
  const [loans, setLoans] = useState<LoanDraft[]>([])

  useEffect(() => {
    if (!open) return
    const e = state.project?.economy ?? emptyEconomy
    const s = (n?: number) => (n ? String(n).replace('.', ',') : '')
    setF({ ...(Object.fromEntries(KEYS.map((k) => [k, s(e[k])])) as Record<NumKey, string>), loanStart: e.loanStart ?? '', zone: e.zone ?? null })
    // Andra lån. Finns inget visas en tom rad att fylla i, t.ex. MC-lånet.
    const drafts = (e.loans ?? []).map((l) => ({ id: l.id, name: l.name, loan: s(l.loan), amortization: s(l.amortization), rate: s(l.rate), loanStart: l.loanStart ?? '' }))
    setLoans(drafts.length ? drafts : [blankLoan()])
  }, [open])

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault()
    const old = state.project?.economy ?? emptyEconomy
    const economy: Economy = {
      ...old,
      loan: parseNum(f.loan), rate: parseNum(f.rate), amortization: parseNum(f.amortization), loanStart: f.loanStart || null, zone: f.zone,
      purchasePrice: parseNum(f.purchasePrice) || undefined, area: parseNum(f.area) || undefined,
      sqmAverage: parseNum(f.sqmAverage) || undefined, sqmTop: parseNum(f.sqmTop) || undefined,
      // Rader utan belopp sparas inte.
      loans: loans.filter((l) => parseNum(l.loan) > 0).map((l) => ({
        id: l.id, name: l.name.trim() || 'Lån', loan: parseNum(l.loan), amortization: parseNum(l.amortization), rate: parseNum(l.rate), loanStart: l.loanStart || null,
      })),
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

        <h3 style={{ margin: 'var(--s-2) 0 0' }}>Andra lån</h3>
        {loans.map((l, i) => {
          const set = (patch: Partial<LoanDraft>) => setLoans(loans.map((x, j) => (j === i ? { ...x, ...patch } : x)))
          return (
            <div key={l.id} className="loan-edit">
              <div className="loan-edit__head">
                <Field label="Namn">
                  <input className="input" placeholder="MC-lån, KTM 990 Duke" value={l.name} onChange={(e) => set({ name: e.target.value })} />
                </Field>
                <button type="button" className="btn btn--ghost" aria-label={`Ta bort ${l.name || 'lånet'}`} onClick={() => setLoans(loans.filter((_, j) => j !== i))}><IconTrash size={16} /></button>
              </div>
              <div className="form__row">
                <Field label="Ursprungligt lån, kr"><input className="input" inputMode="decimal" placeholder="120 000" value={l.loan} onChange={(e) => set({ loan: e.target.value })} /></Field>
                <Field label="Amortering, kr/mån"><input className="input" inputMode="decimal" placeholder="2 500" value={l.amortization} onChange={(e) => set({ amortization: e.target.value })} /></Field>
              </div>
              <div className="form__row">
                <Field label="Ränta, %"><input className="input" inputMode="decimal" placeholder="7,9" value={l.rate} onChange={(e) => set({ rate: e.target.value })} /></Field>
                <Field label="Lånet startade"><input className="input" type="date" value={l.loanStart} onChange={(e) => set({ loanStart: e.target.value })} /></Field>
              </div>
            </div>
          )
        })}
        <button type="button" className="btn btn--secondary" style={{ justifySelf: 'start' }} onClick={() => setLoans([...loans, blankLoan()])}><IconPlus size={16} /> Lägg till lån</button>

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
