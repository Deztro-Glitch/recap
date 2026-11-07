import { useEffect, useState } from 'react'
import { IconChargingPile, IconToolsKitchen2, IconWashMachine } from '@tabler/icons-react'
import { api } from '../../lib/api'
import { emptyEconomy } from '../../lib/economy'
import { kwhCost, ore, useElPrice, type ElPrice } from '../../lib/elpris'
import { parseNum } from '../../lib/format'
import { Field, Primary, Sheet, useToast } from '../../components/ui'
import { AreaChart } from '../../components/Charts'
import type { ProjectState } from '../ProjectView'

// Ungefärlig förbrukning per körning. Uppskattningar tills vidare; senare kan man välja sina egna maskiner.
const MACHINES = [
  { name: 'Diskmaskin', kwh: 1.5, icon: IconToolsKitchen2 },
  { name: 'Tvättmaskin', kwh: 1, icon: IconWashMachine },
  { name: 'Ladda EX40', kwh: 50, icon: IconChargingPile, note: '10–80 %' },
]

const clock = (ms: number) => new Date(ms).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
const money = (kr: number) => `${kr.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`
const decimal = (n?: number) => (n ? String(n).replace('.', ',') : '')
const kwhText = (n: number) => String(n).replace('.', ',')

// Elpris: dagens kurva med var vi är nu, vad det kostar att köra maskinerna just nu, och de egna avgifterna
// så att kostnaden räknas på det man faktiskt betalar (spotpris + nät + skatt + påslag, plus moms).
export function ElectricitySheet({ open, state, onClose }: { open: boolean; state: ProjectState; onClose: () => void }) {
  const toast = useToast()
  const e = state.project?.economy ?? emptyEconomy
  const el = useElPrice(open ? e.zone : null)
  const [f, setF] = useState({ grid: '', tax: '', markup: '' })

  useEffect(() => {
    if (open) setF({ grid: decimal(e.el?.grid), tax: decimal(e.el?.tax), markup: decimal(e.el?.markup) })
  }, [open])

  const fees = { grid: parseNum(f.grid), tax: parseNum(f.tax), markup: parseNum(f.markup) }
  const hasFees = fees.grid + fees.tax + fees.markup > 0
  const cost = el?.now != null ? kwhCost(el.now, fees) : null

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault()
    try {
      await api.updateProject(state.project!.id, { economy: { ...e, el: { grid: fees.grid || undefined, tax: fees.tax || undefined, markup: fees.markup || undefined } } })
      await state.reload()
      toast('Avgifterna är sparade')
    } catch (err: any) {
      toast({ title: 'Avgifterna kunde inte sparas', body: err.message })
    }
  }

  const set = (k: keyof typeof f) => (ev: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: ev.target.value })

  return (
    <Sheet open={open} onClose={onClose} title={`Elpris${e.zone ? `, ${e.zone}` : ''}`} wide>
      <div className="elsheet">
        {el ? <Today el={el} total={hasFees && cost ? cost.total : null} /> : <p className="meta">Hämtar dagens priser …</p>}

        {cost && (
          <section>
            <h3 className="elsheet__h">Kostnad att starta nu:</h3>
            <ul className="machines">
              {MACHINES.map((m) => (
                <li key={m.name} className="machine">
                  <span className="machine__icon"><m.icon size={18} stroke={1.8} /></span>
                  <span className="machine__text">
                    <span className="machine__name">{m.name}</span>
                    <span className="meta">ca {kwhText(m.kwh)} kWh{m.note ? `, ${m.note}` : ''}</span>
                  </span>
                  <b className="machine__cost">{money(m.kwh * cost.total)}</b>
                </li>
              ))}
            </ul>
          </section>
        )}

        <form className="form" onSubmit={save}>
          <h3 className="elsheet__h">Dina avgifter</h3>
          <div className="fees">
            <Field label="Elnätsavgift (öre/kWh)">
              <input className="input" inputMode="decimal" placeholder="25" value={f.grid} onChange={set('grid')} />
            </Field>
            <Field label="Skatt (öre/kWh)">
              <input className="input" inputMode="decimal" placeholder="36" value={f.tax} onChange={set('tax')} />
            </Field>
            <Field label="Påslag (öre/kWh)">
              <input className="input" inputMode="decimal" placeholder="5" value={f.markup} onChange={set('markup')} />
            </Field>
          </div>

          {cost && (
            <dl className="calc calc__rows" aria-live="polite">
              <div><dt className="meta">Spotpris</dt><dd>{ore(cost.spot)}</dd></div>
              <div><dt className="meta">Nät, skatt och påslag</dt><dd>{ore(cost.extra)}</dd></div>
              <div><dt className="meta">Moms 25 %</dt><dd>{ore(cost.vat)}</dd></div>
              <div className="calc__sum"><dt>Totalt per kWh just nu</dt><dd>{ore(cost.total)}</dd></div>
            </dl>
          )}

          <div className="form__actions">
            <Primary>Spara avgifter</Primary>
          </div>
        </form>
      </div>
    </Sheet>
  )
}

// Priset nu, dagens kurva och dagens lägsta, snitt och högsta.
function Today({ el, total }: { el: ElPrice; total: number | null }) {
  const s = el.index >= 0 ? el.slots[el.index] : null
  const at = s ? el.index + (Date.now() - s.start) / (s.end - s.start) : null
  const ticks = el.slots.map((x, i) => ({ i, d: new Date(x.start) })).filter(({ d }) => d.getMinutes() === 0 && d.getHours() % 6 === 0).map(({ i, d }) => ({ i, label: String(d.getHours()).padStart(2, '0') }))
  const cheapest = el.slots.reduce((a, b) => (b.price < a.price ? b : a))
  const dearest = el.slots.reduce((a, b) => (b.price > a.price ? b : a))

  return (
    <>
      <div className="elsheet__now">
        <span className="meta">Spotpris just nu{s ? `, ${clock(s.start)}–${clock(s.end)}` : ''}</span>
        <b className="elsheet__big">{el.now != null ? `${ore(el.now)}/kWh` : '–'}</b>
        {total != null && <span className="meta">{ore(total)}/kWh med avgifter och moms</span>}
      </div>

      <AreaChart
        values={el.slots.map((x) => x.price * 100)}
        at={at}
        ticks={ticks}
        label={`Spotpriset i dag, från ${ore(el.min)} till ${ore(el.max)} per kWh${el.now != null ? `, ${ore(el.now)} just nu` : ''}`}
      />

      <dl className="elstats">
        <div><dt className="meta">Lägst, {clock(cheapest.start)}</dt><dd>{ore(el.min)}</dd></div>
        <div><dt className="meta">Snitt</dt><dd>{ore(el.avg)}</dd></div>
        <div><dt className="meta">Högst, {clock(dearest.start)}</dt><dd>{ore(el.max)}</dd></div>
      </dl>
    </>
  )
}
