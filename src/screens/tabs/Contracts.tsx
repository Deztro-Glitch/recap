import { AnimatePresence } from 'framer-motion'
import { useEffect, useState } from 'react'
import { IconFileText, IconPrinter } from '@tabler/icons-react'
import { api } from '../../lib/api'
import { daysLeft, kr, parseNum } from '../../lib/format'
import { FileField } from '../../components/FileField'
import { SwipeRow } from '../../components/SwipeRow'
import { GlassCard } from '../../components/GlassCard'
import { Counter } from '../../components/Counter'
import { Chips, Field, Primary, Sheet, useToast } from '../../components/ui'
import { COMMON_CONTRACTS, CONTRACT_KIND_LABEL, HOME_CONTRACTS, K6_LABEL, PROVIDERS, type Contract, type ContractKind } from '../../types'
import { contractScope, homeContracts } from '../../lib/economy'
import { K6_MIN_PER_YEAR, k6Deductions, lastSaleYear } from '../../lib/k6'
import type { ProjectState, ViewProps } from '../view'
import { sheetFor } from './Items'
import { allItems, byDate, fmtDate, removeRow, roomFacts, sum, type Item } from '../../lib/items'

const KINDS = Object.keys(CONTRACT_KIND_LABEL) as ContractKind[]
const SOON = 30

// Hur nära slutdatumet avtalet är. Inom 30 dagar är det dags att förhandla.
export function ContractStatus({ c }: { c: Contract }) {
  if (!c.ends_on) return <div className="meta">Löpande</div>
  const d = daysLeft(c.ends_on)
  if (d < 0) return <span className="status status--lost">Gick ut {fmtDate(c.ends_on)}</span>
  if (d <= SOON) return <span className="status status--warning">{d === 0 ? 'Går ut i dag' : `Går ut om ${d} ${d === 1 ? 'dag' : 'dagar'}`}</span>
  return <div className="meta">Till {fmtDate(c.ends_on)}</div>
}

export type ContractTab = 'contracts' | 'cv'

export function Contracts({ state, open, tab }: ViewProps & { tab: ContractTab }) {
  return (
    <div>
      <div className="section-head">
        <h1>{tab === 'contracts' ? 'Avtal och abonnemang' : 'Bostads-CV'}</h1>
      </div>
      {tab === 'contracts' ? <ContractList state={state} open={open} /> : <HomeCv state={state} open={open} />}
    </div>
  )
}

function ContractList({ state, open }: ViewProps) {
  // Det som snart går ut först, sedan resten i bokstavsordning.
  const list = [...state.contracts].sort((a, b) => {
    const da = a.ends_on ? daysLeft(a.ends_on) : Infinity
    const db = b.ends_on ? daysLeft(b.ends_on) : Infinity
    return (da <= SOON ? da : Infinity) - (db <= SOON ? db : Infinity) || a.provider.localeCompare(b.provider, 'sv')
  })
  const monthly = (cs: Contract[]) => cs.reduce((s, c) => s + (Number(c.monthly) || 0), 0)
  const home = list.filter((c) => contractScope(c) === 'home')
  const subs = list.filter((c) => contractScope(c) === 'private')
  const counted = homeContracts(list)
  // Streaming kan man ha flera av, så det föreslås alltid.
  const missing = COMMON_CONTRACTS.filter((k) => k === 'streaming' || !list.some((c) => c.kind === k))

  return (
    <>
      {list.length > 0 && (
        <div className="kpis section">
          <GlassCard className="kpi"><div className="meta">Boendeavtal</div><div className="kpi__value"><Counter value={monthly(counted)} format={(v) => `${kr(v)}/mån`} /></div><div className="meta">Räknas i Ren månadskostnad</div></GlassCard>
          <GlassCard className="kpi"><div className="meta">Privata abonnemang</div><div className="kpi__value"><Counter value={monthly(subs)} format={(v) => `${kr(v)}/mån`} /></div><div className="meta">{kr(monthly(list) * 12)} per år totalt</div></GlassCard>
        </div>
      )}
      <ContractGroup title="Boendeavtal" list={home} state={state} open={open} sum={monthly(home)} />
      <ContractGroup title="Privata abonnemang" list={subs} state={state} open={open} sum={monthly(subs)} />
      {missing.length > 0 && (
        <div className="section">
          <div className="section-head"><h2>Vanliga avtal</h2></div>
          <div className="chips">
            {missing.map((k) => (
              <button key={k} className="chip" onClick={() => open({ t: 'contract', item: { kind: k } })}>+ {CONTRACT_KIND_LABEL[k]}</button>
            ))}
            <button className="chip" onClick={() => open({ t: 'contract', item: { kind: 'annat' } })}>+ Eget</button>
          </div>
        </div>
      )}
    </>
  )
}

function ContractGroup({ title, list, state, open, sum }: ViewProps & { title: string; list: Contract[]; sum: number }) {
  if (!list.length) return null
  return (
    <div className="section">
      <div className="section-head">
        <h2>{title}</h2>
        <span className="row__amount">{kr(sum)}/mån</span>
      </div>
      <div className="rows">
        <AnimatePresence initial={false}>
          {list.map((c) => (
            <SwipeRow key={c.id} onClick={() => open({ t: 'contract', item: c })} onDelete={() => removeRow(state, 'contracts', c.id, c.provider)}>
              <div className="row__main">
                <span className="menu-row__icon"><IconFileText size={18} /></span>
                <div className="row__text">
                  <div className="row__title">{CONTRACT_KIND_LABEL[c.kind]} · {c.provider}</div>
                  <ContractStatus c={c} />
                  {c.kind === 'bolan' && <div className="meta">Räknas via Ekonomi</div>}
                </div>
              </div>
              {c.file_path && state.urls[c.file_path] && (
                <a className="row__link" href={state.urls[c.file_path]} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>Avtal</a>
              )}
              {c.monthly > 0 && <span className="row__amount">{kr(c.monthly)}</span>}
            </SwipeRow>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}

// Bostads-CV: underlag för K6-avdrag och det som följer med till nästa ägare.
function HomeCv({ state, open }: ViewProps) {
  const all = allItems(state)
  const items = all.filter((i) => i.done)
  const k6 = k6Deductions(items)
  const stays = items.filter((i) => i.stays).sort(byDate)
  const rooms = state.rooms.map((r) => ({ room: r, facts: roomFacts(all.filter((i) => i.room_id === r.id)) })).filter((r) => r.facts.length)
  const roomName = (id: string | null) => state.rooms.find((r) => r.id === id)?.name
  const thisYear = new Date().getFullYear()

  const list = (rows: Item[], empty: string, extra?: (i: Item) => React.ReactNode) =>
    rows.length ? (
      <div className="rows">
        {rows.map((i) => (
          <GlassCard key={i.id} className="row" onClick={() => open(sheetFor(i))}>
            <div className="row__text">
              <div className="row__title">{i.title}</div>
              <div className="meta">{[i.date && fmtDate(i.date), roomName(i.room_id), i.store].filter(Boolean).join(' · ')}</div>
              {extra?.(i)}
            </div>
            {i.amount > 0 && <span className="row__amount">{kr(i.amount)}</span>}
          </GlassCard>
        ))}
      </div>
    ) : (
      <p className="meta">{empty}</p>
    )

  return (
    <div className="cv">
      <div className="cv__head">
        <h2>{state.project!.name}</h2>
        {state.project!.address && <span className="meta">{state.project!.address}</span>}
        <button className="btn btn--secondary no-print" onClick={() => print()}><IconPrinter size={16} /> Skriv ut eller spara som PDF</button>
      </div>

      <div className="section">
        <div className="section-head"><h2>Värdehöjande förbättringar (K6)</h2></div>
        <div className="section-head"><h3>{K6_LABEL.basic}</h3><span className="row__amount">{kr(k6.basicSum)}</span></div>
        <p className="meta" style={{ marginTop: 0 }}>Ny- eller ombyggnad. Avdragsgill oavsett när den gjordes.</p>
        {list([...k6.basic].sort(byDate), 'Inget markerat')}

        <div className="section-head" style={{ marginTop: 'var(--s-5)' }}><h3>{K6_LABEL.maintenance}</h3><span className="row__amount">{kr(k6.maintenanceSum)}</span></div>
        <p className="meta" style={{ marginTop: 0 }}>Avdragsgill bara om du säljer under inköpsåret eller de fem åren efter.</p>
        {list([...k6.maintenance].sort(byDate), 'Inget markerat', (i) => (
          <span className={`status ${lastSaleYear(i) >= thisYear ? 'status--sent' : 'status--lost'}`}>
            {lastSaleYear(i) >= thisYear ? `Inköpt ${lastSaleYear(i) - 5}, gäller vid försäljning till och med ${lastSaleYear(i)}` : `Inköpt ${lastSaleYear(i) - 5}, gäller inte längre`}
          </span>
        ))}
        {k6.belowLimit.length > 0 && (
          <p className="meta">Under {kr(K6_MIN_PER_YEAR)} ett år räknas inte: {[...new Set(k6.belowLimit)].sort().join(', ')}.</p>
        )}
      </div>

      <div className="section">
        <div className="section-head"><h2>Följer med lägenheten</h2><span className="row__amount">{kr(sum(stays))}</span></div>
        {list(stays, 'Inget markerat')}
      </div>

      <div className="section">
        <div className="section-head"><h2>Rumsfakta</h2></div>
        {rooms.length ? (
          <div className="cv__rooms">
            {rooms.map(({ room, facts }) => (
              <div key={room.id}>
                <h3>{room.name}</h3>
                <dl className="facts">
                  {facts.map((d) => <div key={d.label + d.value}><dt className="meta">{d.label}</dt><dd>{d.value}</dd></div>)}
                </dl>
              </div>
            ))}
          </div>
        ) : (
          <p className="meta">Inga färgkoder eller mått än</p>
        )}
      </div>
    </div>
  )
}

export function ContractSheet({ item, state, onClose }: { item: Contract | Partial<Contract> | null; state: ProjectState; onClose: () => void }) {
  const toast = useToast()
  const c = item?.id ? (item as Contract) : null
  const [f, setF] = useState({ kind: 'el' as ContractKind, scope: 'home' as 'home' | 'private', provider: '', monthly: '', ends_on: '', file: null as string | null, note: '' })
  const [fileUrl, setFileUrl] = useState<string | undefined>()

  useEffect(() => {
    if (!item) return
    const kind = item.kind ?? 'el'
    setF({ kind, scope: item.scope ?? (HOME_CONTRACTS.includes(kind) ? 'home' : 'private'), provider: item.provider ?? '', monthly: item.monthly ? String(item.monthly) : '', ends_on: item.ends_on ?? '', file: item.file_path ?? null, note: item.note ?? '' })
    setFileUrl(item.file_path ? state.urls[item.file_path] : undefined)
  }, [item])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const row = { kind: f.kind, scope: f.scope, provider: f.provider.trim(), monthly: parseNum(f.monthly), ends_on: f.ends_on || null, file_path: f.file, note: f.note.trim() || null }
    try {
      if (c) {
        if (c.file_path && c.file_path !== f.file) await api.removeFile(c.file_path)
        await api.update('contracts', c.id, row)
      } else await api.insert('contracts', { ...row, project_id: state.project!.id })
      await state.reload()
      toast(c ? 'Ändringarna är sparade' : `${row.provider} är tillagt`)
      onClose()
    } catch (err: any) {
      toast({ title: 'Avtalet kunde inte sparas', body: err.message })
    }
  }

  const del = async () => {
    await api.remove('contracts', c!.id)
    await state.reload()
    toast(`${c!.provider} är borttaget`)
    onClose()
  }

  return (
    <Sheet open={!!item} onClose={onClose} title={c ? c.provider : item?.kind ? CONTRACT_KIND_LABEL[item.kind] : 'Nytt avtal'}>
      <form className="form" onSubmit={save}>
        <Chips value={f.kind} onChange={(k) => setF({ ...f, kind: k, scope: HOME_CONTRACTS.includes(k) ? 'home' : 'private' })} options={KINDS.map((k) => ({ value: k, label: CONTRACT_KIND_LABEL[k] }))} />
        <div className="field">
          <span className="field__label">Räknas som</span>
          <Chips value={f.scope} onChange={(v) => setF({ ...f, scope: v })} options={[{ value: 'home', label: 'Boendeavtal' }, { value: 'private', label: 'Privat abonnemang' }]} />
        </div>
        <Field label="Leverantör">
          <input className="input" placeholder={PROVIDERS[f.kind]?.[0] ?? 'Skriv namnet'} value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })} required />
        </Field>
        {PROVIDERS[f.kind] && (
          <div className="chips">
            {PROVIDERS[f.kind]!.map((p) => (
              <button type="button" key={p} className={`chip ${f.provider === p ? 'is-active' : ''}`} onClick={() => setF({ ...f, provider: p })}>{p}</button>
            ))}
          </div>
        )}
        <div className="form__row">
          <Field label="Kostnad per månad">
            <input className="input" inputMode="decimal" placeholder="450" value={f.monthly} onChange={(e) => setF({ ...f, monthly: e.target.value })} />
          </Field>
          <Field label="Bindning eller rabatt till">
            <input className="input" type="date" value={f.ends_on} onChange={(e) => setF({ ...f, ends_on: e.target.value })} />
          </Field>
        </div>
        <FileField pid={state.project!.id} label="Avtal" path={f.file} url={fileUrl} onChange={(path, url) => { setF((x) => ({ ...x, file: path })); setFileUrl(url) }} />
        <Field label="Anteckning">
          <textarea className="textarea" rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </Field>
        <div className="form__actions">
          <Primary>{c ? 'Spara' : 'Lägg till'}</Primary>
          {c && <button type="button" className="btn btn--danger" onClick={del}>Ta bort</button>}
        </div>
      </form>
    </Sheet>
  )
}
