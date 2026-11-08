import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { IconArrowUpRight, IconListCheck } from '@tabler/icons-react'
import { api } from '../../lib/api'
import { kr, parseNum } from '../../lib/format'
import { CATEGORY } from '../../lib/budget'
import { suggestPlanned } from '../../lib/receiptReader'
import { GlassCard } from '../../components/GlassCard'
import { Chips, Field, Primary, Sheet, useToast } from '../../components/ui'
import { K6_LABEL, type BudgetCategory, type K6Kind, type Purchase, type Scope } from '../../types'
import type { ProjectState, ViewProps } from '../ProjectView'
import { fmtDate } from './Items'

// Det AI:n var osäker på när den sorterade kvitton. Syns i båda lägena, oavsett om raden hör till Projekt eller Boende.
export const toReview = (state: Pick<ProjectState, 'purchases'>) =>
  state.purchases.filter((p) => p.needs_review).sort((a, b) => a.created_at.localeCompare(b.created_at))

// Ett smalt kort överst på Översikt, bara när något väntar.
export function ReviewCard({ state, open }: ViewProps) {
  const items = toReview(state)
  const stores = [...new Set(items.map((p) => p.store).filter(Boolean))].slice(0, 3).join(' · ')
  return (
    <AnimatePresence initial={false}>
      {items.length > 0 && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0, marginBottom: 0 }} transition={{ duration: 0.3 }} className="review-card-wrap">
          <GlassCard className="review-card" onClick={() => open({ t: 'review' })}>
            <span className="review-card__icon"><IconListCheck size={18} stroke={1.9} /></span>
            <span className="review-card__text">
              <span className="review-card__title">{items.length} att granska</span>
              {stores && <span className="meta">{stores}</span>}
            </span>
            <span className="kpi__open" aria-hidden><IconArrowUpRight size={15} stroke={2} /></span>
          </GlassCard>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

const CATEGORIES = Object.keys(CATEGORY) as BudgetCategory[]

// Går igenom raderna en i taget: AI:ns gissning är ifylld, "Stämmer" sparar och nästa rad kommer.
export function ReviewSheet({ open, state, onClose }: { open: boolean; state: ProjectState; onClose: () => void }) {
  const toast = useToast()
  const [skipped, setSkipped] = useState<string[]>([])
  const queue = toReview(state)
  const rest = queue.filter((p) => !skipped.includes(p.id))
  const item = rest[0] ?? null
  const last = useRef<Purchase | null>(null)
  if (item) last.current = item
  const shown = item ?? last.current

  useEffect(() => {
    if (open) setSkipped([])
  }, [open])
  // När allt är genomgånget stängs panelen.
  useEffect(() => {
    if (open && !item && last.current) {
      onClose()
      if (!queue.length) toast('Allt är granskat')
    }
  }, [open, item?.id])

  return (
    <Sheet open={open} onClose={onClose} title="Att granska">
      {shown && (
        <ReviewForm
          key={shown.id}
          item={shown}
          state={state}
          place={`${queue.length - rest.length + 1} av ${queue.length}`}
          onSkip={() => setSkipped((s) => [...s, shown.id])}
        />
      )}
    </Sheet>
  )
}

function ReviewForm({ item, state, place, onSkip }: { item: Purchase; state: ProjectState; place: string; onSkip: () => void }) {
  const toast = useToast()
  const [f, setF] = useState({
    title: item.title,
    price: String(item.price ?? item.est_price ?? '').replace('.', ','),
    category: (item.category ?? 'other') as BudgetCategory,
    scope: (item.scope ?? 'home') as Scope,
    room_id: item.room_id ?? '',
    k6: (item.k6 ? item.k6_kind ?? 'basic' : '') as K6Kind | '',
  })
  const [busy, setBusy] = useState(false)
  const receipt = state.receipts.find((r) => r.id === item.receipt_id)
  const image = receipt?.file_path ? state.urls[receipt.file_path] : undefined
  // Ett planerat köp som raden kanske är. Man kopplar den med en knapp.
  const open = state.purchases.filter((p) => !p.bought)
  const planId = suggestPlanned(f.title, parseNum(f.price), f.room_id || null, open.map((p) => ({ id: p.id, title: p.title, price: Number(p.est_price) || 0, room_id: p.room_id })))
  const plan = open.find((p) => p.id === planId)
  const [link, setLink] = useState(false)

  const fields = () => ({
    title: f.title.trim() || item.title, price: parseNum(f.price), category: f.category, scope: f.scope,
    room_id: f.room_id || null, k6: !!f.k6, k6_kind: f.k6 || null, needs_review: false,
  })
  const ok = async () => {
    setBusy(true)
    try {
      if (plan && link) {
        // Raden är det planerade köpet: det blir klart med kvittots uppgifter, och kvittoraden försvinner.
        await api.update('purchases', plan.id, { ...fields(), room_id: f.room_id || plan.room_id, bought: true, bought_on: item.bought_on, store: item.store, receipt_id: item.receipt_id })
        await api.remove('purchases', item.id)
      } else {
        await api.update('purchases', item.id, fields())
      }
      await state.reload()
    } catch (err: any) {
      toast({ title: 'Det gick inte att spara', body: err.message })
      setBusy(false)
    }
  }
  const remove = async () => {
    setBusy(true)
    try {
      await api.remove('purchases', item.id)
      await state.reload()
    } catch (err: any) {
      toast({ title: 'Det gick inte att ta bort', body: err.message })
      setBusy(false)
    }
  }

  return (
    <motion.div className="form" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }}>
      <div className="review-head">
        {image && <a href={image} target="_blank" rel="noreferrer"><img src={image} alt="Kvittot" /></a>}
        <div className="review-head__fields">
          <span className="review-card__title">{item.store ?? 'Kvitto'}</span>
          <span className="meta">{[item.bought_on && fmtDate(item.bought_on), place].filter(Boolean).join(' · ')}</span>
        </div>
      </div>
      <div className="review-line__top">
        <input className="input" aria-label="Vad" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <input className="input review-line__price" aria-label="Pris" inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
      </div>
      <Field label="Kategori">
        <select className="select" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as BudgetCategory })}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY[c].label}</option>)}
        </select>
      </Field>
      <div className="field">
        <span className="field__label">Hör till</span>
        <Chips value={f.scope} onChange={(scope) => setF({ ...f, scope })} options={[{ value: 'build' as Scope, label: 'Projekt' }, { value: 'home' as Scope, label: 'Boende' }]} />
      </div>
      <Field label="Rum">
        <select className={`select ${f.room_id ? '' : 'is-empty'}`} value={f.room_id} onChange={(e) => setF({ ...f, room_id: e.target.value })}>
          <option value="">Inget rum</option>
          {state.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </Field>
      <Field label="K6-avdrag">
        <select className="select" value={f.k6} onChange={(e) => setF({ ...f, k6: e.target.value as K6Kind | '' })}>
          <option value="">Inget K6-avdrag</option>
          {(['basic', 'maintenance'] as K6Kind[]).map((k) => <option key={k} value={k}>{K6_LABEL[k]}</option>)}
        </select>
      </Field>
      {plan && (
        <div className={`review-match ${link ? 'is-linked' : ''}`}>
          <span>{link ? 'Stänger' : 'Kan vara'} <b>{plan.title}</b>{Number(plan.est_price) ? ` (planerad ca ${kr(Number(plan.est_price))})` : ' (planerad)'}</span>
          <button type="button" className="link-btn" onClick={() => setLink(!link)}>{link ? 'Ångra' : 'Koppla'}</button>
        </div>
      )}
      <div className="form__actions review-actions">
        <button type="button" className="btn btn--ghost" disabled={busy} onClick={remove}>Ta bort</button>
        <button type="button" className="btn btn--ghost" disabled={busy} onClick={onSkip}>Senare</button>
        <Primary disabled={busy} onClick={ok}>Stämmer</Primary>
      </div>
    </motion.div>
  )
}
