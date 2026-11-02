import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { emptyEconomy, economyNumbers } from '../../lib/economy'
import { kr, parseNum } from '../../lib/format'
import { Field, Primary, Sheet, useToast } from '../../components/ui'
import type { Economy } from '../../types'
import type { ProjectState, ViewProps } from '../ProjectView'
import { fmtDate } from './Items'

// Toppkorten och bolånemätaren i Boendeläget.
export function EconomyDashboard({ state, open }: ViewProps) {
  const e = state.project?.economy
  const n = economyNumbers(e ?? emptyEconomy)
  const edit = () => open({ t: 'economy' })

  return (
    <>
      <div className="kpis kpis--three">
        <button className="kpi kpi--button" onClick={edit}>
          <div className="meta">Ren månadskostnad</div>
          <div className="kpi__value">{e ? kr(n.costs) : '–'}</div>
          <div className="meta">Pengar ut</div>
        </button>
        <button className="kpi kpi--button" onClick={edit}>
          <div className="meta">Ditt sparande</div>
          <div className="kpi__value">{e ? kr(n.saving) : '–'}</div>
          <div className="meta">Pengar in i bostaden</div>
        </button>
        <button className="kpi kpi--button" onClick={edit}>
          <div className="meta">Totalt kassaflöde</div>
          <div className="kpi__value">{e ? kr(n.cashflow) : '–'}</div>
          <div className="meta">Kostnad och amortering</div>
        </button>
      </div>

      <div className="loan section" onClick={edit} role="button" tabIndex={0} onKeyDown={(k) => k.key === 'Enter' && edit()}>
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
          <button className="btn btn--secondary" onClick={(ev) => { ev.stopPropagation(); edit() }}>Lägg in bolån och avgifter</button>
        )}
      </div>
    </>
  )
}

const FIELDS = {
  loan: 'Ursprungligt lån, kr',
  rate: 'Aktuell ränta, %',
  amortization: 'Amortering, kr/mån',
  fee: 'Avgift till föreningen, kr/mån',
  electricity: 'El ungefär, kr/mån',
  insurance: 'Hemförsäkring, kr/mån',
} as const
type NumKey = keyof typeof FIELDS

export function EconomySheet({ open, state, onClose }: { open: boolean; state: ProjectState; onClose: () => void }) {
  const toast = useToast()
  const [f, setF] = useState<Record<NumKey, string> & { loanStart: string }>({ loan: '', rate: '', amortization: '', fee: '', electricity: '', insurance: '', loanStart: '' })

  useEffect(() => {
    if (!open) return
    const e = state.project?.economy ?? emptyEconomy
    const s = (n: number) => (n ? String(n).replace('.', ',') : '')
    setF({ loan: s(e.loan), rate: s(e.rate), amortization: s(e.amortization), fee: s(e.fee), electricity: s(e.electricity), insurance: s(e.insurance), loanStart: e.loanStart ?? '' })
  }, [open])

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault()
    const economy: Economy = {
      loan: parseNum(f.loan), rate: parseNum(f.rate), amortization: parseNum(f.amortization), loanStart: f.loanStart || null,
      fee: parseNum(f.fee), electricity: parseNum(f.electricity), insurance: parseNum(f.insurance),
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

        <h3 style={{ margin: 'var(--s-2) 0 0' }}>Fasta utgifter</h3>
        {input('fee', '4 200')}
        <div className="form__row">
          {input('electricity', '600')}
          {input('insurance', '180')}
        </div>

        <div className="form__actions">
          <Primary>Spara</Primary>
        </div>
      </form>
    </Sheet>
  )
}
