import { useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { IconArrowUp, IconCheck, IconLoader2, IconSparkles } from '@tabler/icons-react'
import { api } from '../../lib/api'
import { CATEGORY, readQuickEntry, type QuickEntry } from '../../lib/budget'
import { kr } from '../../lib/format'
import { GlassCard } from '../../components/GlassCard'
import { useToast } from '../../components/ui'
import type { Purchase } from '../../types'
import type { ProjectState } from '../view'
import { today } from '../../lib/items'

// Snabb inmatning på dashboarden: skriv "Vinglas 699kr" och skicka. AI:n väljer namn, belopp och kategori
// (Edge Function quick-entry); köpet sparas som klart och syns direkt i kassaflödet, Inköp och budgeten.
// Under fältet visas vad som sparades och var det hamnade.
export function QuickEntryCard({ state }: { state: ProjectState }) {
  const toast = useToast()
  const still = useReducedMotion()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState<(QuickEntry & { id: string }) | null>(null)
  const field = useRef<HTMLInputElement>(null)

  const send = async (ev: React.FormEvent) => {
    ev.preventDefault()
    const input = text.trim()
    if (!state.project || busy || !input) return
    setBusy(true)
    try {
      const entry = await readQuickEntry(input)
      if (!entry) {
        toast('Skriv ett belopp, t.ex. Vinglas 699 kr')
        return
      }
      const row = await api.insert<Purchase>('purchases', {
        project_id: state.project.id, room_id: null, title: entry.title, est_price: 0, price: entry.amount,
        bought: true, bought_on: today(), scope: entry.scope, category: entry.category, priority: 2, stays: false, k6: false,
        store: null, link: null, note: null, details: null, receipt_path: null, image_path: null,
      })
      await state.reload()
      setText('')
      setSaved({ ...entry, id: row.id })
    } catch (err: any) {
      toast({ title: 'Köpet kunde inte sparas', body: err.message })
    } finally {
      setBusy(false)
      field.current?.focus()
    }
  }

  const c = saved ? CATEGORY[saved.category] : null
  return (
    <GlassCard className="kpi glass--light eco-dash__quick quick-card" lift={false}>
      <div className="kpi__head">
        <span className="kpi__icon"><IconSparkles size={16} stroke={1.8} /></span>
        <span className="kpi__label">Snabb inmatning</span>
      </div>

      <form className="quick" onSubmit={send}>
        <input
          ref={field}
          className="quick__input"
          placeholder="T.ex. Vinglas 699kr"
          aria-label="Snabb inmatning"
          enterKeyHint="send"
          autoComplete="off"
          value={text}
          onChange={(ev) => setText(ev.target.value)}
        />
        <button className="quick__send" type="submit" disabled={!text.trim() || busy} aria-busy={busy}>
          {busy ? <IconLoader2 size={18} className="spin" /> : <IconArrowUp size={18} stroke={2.4} />}
          <span>Skicka</span>
        </button>
      </form>

      <AnimatePresence mode="wait" initial={false}>
        {saved && c && (
          <motion.p
            key={saved.id}
            className="quick__saved"
            role="status"
            initial={still ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <IconCheck size={16} stroke={2.4} className="quick__ok" />
            <span className="quick__what">{saved.title} – {kr(saved.amount)}</span>
            <span className="quick__cat"><i style={{ background: c.color }} />{saved.scope === 'build' ? 'Projekt' : c.label}</span>
          </motion.p>
        )}
      </AnimatePresence>
    </GlassCard>
  )
}
