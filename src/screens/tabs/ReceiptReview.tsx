import { useEffect, useRef, useState } from 'react'
import { IconPlus, IconX } from '@tabler/icons-react'
import { api } from '../../lib/api'
import { kr, parseNum } from '../../lib/format'
import { readReceipt, guessRoom, type ReceiptScan, type ScanLine } from '../../lib/receiptReader'
import { Chips, Field, Loader, Primary, Sheet, useToast } from '../../components/ui'
import { K6_LABEL, SCOPE_LABEL, modeScope, type K6Kind, type Purchase, type Receipt, type Scope } from '../../types'
import type { ProjectState } from '../ProjectView'
import { fmtDate, guessScope, today } from './Items'

// linked är true när man har bekräftat att raden är det planerade köpet match_id.
interface Row extends Omit<ScanLine, 'price'> { key: number; price: string; linked: boolean; choosing?: boolean }
let seq = 0
const toRow = (l: ScanLine): Row => ({ ...l, price: String(l.price).replace('.', ','), key: ++seq, linked: false })

// Granskning av ett fotat kvitto: raderna som lästes ut, med rum och läge att justera innan man sparar.
// Varje rad blir ett eget inköp, kopplat till kvittot.
export function ReceiptReview({ file, defaultRoom, state, onClose }: { file: File | null; defaultRoom: string | null; state: ProjectState; onClose: () => void }) {
  const toast = useToast()
  const [scan, setScan] = useState<ReceiptScan | null>(null)
  const [progress, setProgress] = useState(0)
  const [rows, setRows] = useState<Row[]>([])
  const [ignored, setIgnored] = useState<Row[]>([])
  const [store, setStore] = useState('')
  const [date, setDate] = useState('')
  const [preview, setPreview] = useState<string>()
  const [saving, setSaving] = useState(false)
  const upload = useRef<Promise<string> | null>(null)
  const saved = useRef(false)
  // Planerade köp som en rad kan stänga, t.ex. "Soffa, ca 7 000 kr".
  const planned = state.purchases.filter((p) => !p.bought)
  const plannedById = (id?: string | null) => planned.find((p) => p.id === id)

  useEffect(() => {
    if (!file) return
    saved.current = false
    setScan(null)
    setProgress(0)
    const url = URL.createObjectURL(file)
    setPreview(url)
    // Bilden laddas upp medan kvittot läses, så att det går fort att spara.
    upload.current = api.uploadFile(state.project!.id, file)
    const refs = planned.map((p) => ({ id: p.id, title: p.title, price: Number(p.est_price) || 0, room_id: p.room_id }))
    readReceipt(file, { rooms: state.rooms, planned: refs }, setProgress).then((s) => {
      setScan(s)
      // Valde man ett rum innan kvittot fotades gäller det för raderna som inte fick ett eget.
      const lines = s.lines.length ? s.lines : [{ title: '', price: s.total ?? 0, room_id: null, scope: 'home' as Scope }]
      setRows(lines.map((l) => toRow({ ...l, room_id: l.room_id ?? defaultRoom })))
      setIgnored(s.ignored.map(toRow))
      setStore(s.store ?? '')
      setDate(s.date ?? today())
    })
    return () => URL.revokeObjectURL(url)
  }, [file])

  // Stänger man utan att spara behövs inte bilden.
  const cancel = async () => {
    onClose()
    if (!saved.current) upload.current?.then((p) => api.removeFile(p)).catch(() => {})
  }

  const set = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const total = rows.reduce((s, r) => s + parseNum(r.price), 0)
  const valid = rows.filter((r) => r.title.trim())

  const save = async () => {
    if (!valid.length) return
    setSaving(true)
    try {
      const pid = state.project!.id
      const file_path = await upload.current!
      const receipt = await api.insert<Receipt>('receipts', { project_id: pid, file_path, store: store.trim() || null, bought_on: date || today(), total })
      const diffs: string[] = []
      for (const r of valid) {
        const plan = r.linked ? plannedById(r.match_id) : undefined
        if (plan) {
          // Raden stänger det planerade köpet i stället för att bli ett nytt.
          await api.update('purchases', plan.id, {
            title: r.title.trim(), price: parseNum(r.price), bought: true, bought_on: date || today(),
            store: store.trim() || null, receipt_id: receipt.id, room_id: r.room_id ?? plan.room_id,
            ...(r.k6Kind ? { k6: true, k6_kind: r.k6Kind } : {}),
          })
          const est = Number(plan.est_price) || 0
          const d = est - parseNum(r.price)
          if (est) diffs.push(`${plan.title}: ${Math.abs(d) < 1 ? 'precis som planerat' : `${kr(Math.abs(d))} ${d > 0 ? 'under' : 'över'} det planerade`}`)
          continue
        }
        await api.insert<Purchase>('purchases', {
          project_id: pid, receipt_id: receipt.id, title: r.title.trim(), price: parseNum(r.price), est_price: 0, bought: true, bought_on: date || today(),
          store: store.trim() || null, room_id: r.room_id, scope: r.scope, receipt_path: null, image_path: null, priority: 2, stays: false,
          k6: !!r.k6Kind, k6_kind: r.k6Kind ?? null,
          link: null, note: null, details: null,
        })
      }
      saved.current = true
      await state.reload()
      // Säg var raderna hamnade, så att man hittar dem även när de hör till det andra läget.
      const here = modeScope(state.project?.mode)
      const away = valid.filter((r) => r.scope !== here).length
      const noRoom = valid.filter((r) => !r.room_id).length
      toast({
        title: `${valid.length} ${valid.length === 1 ? 'sak' : 'saker'} sparade i Inköp under Klart`,
        body: [diffs.length && `${diffs.join('. ')}.`, away && `${away} syns i ${here === 'home' ? 'Projekt' : 'Boende'}läget.`, noRoom && `${noRoom} saknar rum.`].filter(Boolean).join(' ') || undefined,
      })
      onClose()
    } catch (err: any) {
      toast({ title: 'Kvittot kunde inte sparas', body: err.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={!!file} onClose={cancel} title="Granska kvittot">
      {!scan ? (
        <div className="form">
          {preview && <img className="picked" src={preview} alt="" />}
          <div className="plan-tools">
            <Loader />
            <span className="status status--sent">Läser kvittot{progress > 0 ? `, ${Math.round(progress * 100)} %` : ''}</span>
          </div>
        </div>
      ) : (
        <div className="form">
          <div className="review-head">
            {preview && <a href={preview} target="_blank" rel="noreferrer"><img src={preview} alt="Kvittot" /></a>}
            <div className="review-head__fields">
              <Field label="Butik"><input className="input" value={store} onChange={(e) => setStore(e.target.value)} placeholder="Bauhaus" /></Field>
              <Field label="Datum"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            </div>
          </div>
          {scan.example && <span className="tag" style={{ alignSelf: 'flex-start' }}>Exempeldata i demoläget</span>}
          {scan.note && <span className="status status--warning">{scan.note}</span>}

          <div className="review-lines">
            {rows.map((r) => (
              <div key={r.key} className="review-line">
                <div className="review-line__top">
                  <input className="input" aria-label="Vad" placeholder="Vad" value={r.title}
                    onChange={(e) => set(r.key, { title: e.target.value })}
                    onBlur={(e) => !r.room_id && set(r.key, { room_id: guessRoom(e.target.value, state.rooms), scope: guessScope(e.target.value) })} />
                  <input className="input review-line__price" aria-label="Pris" inputMode="decimal" placeholder="0" value={r.price} onChange={(e) => set(r.key, { price: e.target.value })} />
                  <button type="button" className="btn btn--ghost" aria-label={`Ta bort ${r.title || 'raden'}`} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}><IconX size={16} /></button>
                </div>
                <div className="review-line__bottom">
                  <select className={`select ${r.room_id ? '' : 'is-empty'}`} aria-label="Rum" value={r.room_id ?? ''} onChange={(e) => set(r.key, { room_id: e.target.value || null })}>
                    <option value="">Inget rum</option>
                    {state.rooms.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                  <Chips value={r.scope} onChange={(v) => set(r.key, { scope: v })} options={(['build', 'home'] as Scope[]).map((v) => ({ value: v, label: v === 'build' ? 'Projekt' : SCOPE_LABEL[v] }))} />
                </div>
                <select className="select" aria-label="K6-avdrag" value={r.k6Kind ?? ''} onChange={(e) => set(r.key, { k6Kind: (e.target.value || null) as K6Kind | null })}>
                  <option value="">Inget K6-avdrag</option>
                  {(['basic', 'maintenance'] as K6Kind[]).map((k) => <option key={k} value={k}>K6: {K6_LABEL[k]}</option>)}
                </select>
                <MatchPrompt row={r} plan={plannedById(r.match_id)} free={planned.filter((p) => !rows.some((x) => x.key !== r.key && x.linked && x.match_id === p.id))}
                  onChange={(patch) => set(r.key, patch)} />
              </div>
            ))}
          </div>
          <div>
            <button type="button" className="btn btn--ghost" style={{ marginLeft: -16 }} onClick={() => setRows((rs) => [...rs, toRow({ title: '', price: 0, room_id: null, scope: 'home' })])}>
              <IconPlus size={16} /> Rad
            </button>
          </div>

          {ignored.length > 0 && (
            <p className="meta" style={{ margin: 0 }}>
              {ignored.length} irrelevant{ignored.length === 1 ? '' : 'a'} artikl{ignored.length === 1 ? 'el' : 'ar'} ({ignored.map((i) => i.title).join(', ')}) exkluderades.{' '}
              <button type="button" className="link-btn" onClick={() => { setRows((rs) => [...rs, ...ignored]); setIgnored([]) }}>Ta med</button>
            </p>
          )}

          <div className="review-total">
            <span className="meta">Summa</span>
            <span className="row__amount">{kr(total)}</span>
            {scan.total != null && Math.abs(scan.total - total - ignored.reduce((s, i) => s + parseNum(i.price), 0)) > 1 && (
              <span className="status status--warning">Kvittot säger {kr(scan.total)}</span>
            )}
          </div>

          <div className="form__actions">
            <Primary disabled={saving || !valid.length} onClick={save}>{saving ? 'Sparar' : 'Spara allt'}</Primary>
          </div>
        </div>
      )}
    </Sheet>
  )
}

// Frågar om en kvittorad är något man har planerat, eller låter en koppla den själv.
function MatchPrompt({ row, plan, free, onChange }: { row: Row; plan?: Purchase; free: Purchase[]; onChange: (patch: Partial<Row>) => void }) {
  const est = (p: Purchase) => (Number(p.est_price) ? ` (planerad ca ${kr(Number(p.est_price))})` : ' (planerad)')
  if (plan && row.linked) {
    return (
      <div className="review-match is-linked">
        <span>Stänger <b>{plan.title}</b>{est(plan)}</span>
        <button type="button" className="link-btn" onClick={() => onChange({ linked: false, match_id: null })}>Ångra</button>
      </div>
    )
  }
  if (plan) {
    return (
      <div className="review-match">
        <span>Hör den ihop med <b>{plan.title}</b>{est(plan)}?</span>
        <div className="review-match__actions">
          <button type="button" className="btn btn--secondary" onClick={() => onChange({ linked: true, room_id: row.room_id ?? plan.room_id })}>Ja, koppla</button>
          <button type="button" className="btn btn--ghost" onClick={() => onChange({ match_id: null })}>Nej</button>
        </div>
      </div>
    )
  }
  if (!free.length) return null
  if (!row.choosing) return <button type="button" className="link-btn" style={{ justifySelf: 'start' }} onClick={() => onChange({ choosing: true })}>Koppla till planerat köp</button>
  return (
    <select className="select" aria-label="Planerat köp" value="" onChange={(e) => {
      const p = free.find((x) => x.id === e.target.value)
      if (p) onChange({ match_id: p.id, linked: true, choosing: false, room_id: row.room_id ?? p.room_id })
    }}>
      <option value="">Välj planerat köp</option>
      {free.map((p) => <option key={p.id} value={p.id}>{p.title}{Number(p.est_price) ? `, ca ${kr(Number(p.est_price))}` : ''}{p.created_at ? ` · ${fmtDate(p.created_at.slice(0, 10))}` : ''}</option>)}
    </select>
  )
}
