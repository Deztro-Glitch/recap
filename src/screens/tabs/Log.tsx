import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { IconPhoto, IconSearch, IconShoppingBag, IconTool } from '@tabler/icons-react'
import { kr } from '../../lib/format'
import { needsInfo, paid } from '../../lib/useProject'
import { FileThumb } from '../../components/FileField'
import { DetailsList } from '../../components/Details'
import { SwipeRow } from '../../components/SwipeRow'
import { rowAnim } from '../../components/ui'
import type { Detail, Photo } from '../../types'
import type { ViewProps } from '../ProjectView'
import { removeRow } from './Purchases'

interface Entry {
  key: string
  date: string
  order: string
  title: string
  meta: (string | null | undefined)[]
  details: Detail[] | null
  amount: number
  file: string | null
  photos?: Photo[]
  warning?: string
  icon: React.ComponentType<{ size?: number }>
  extra: (string | null)[]   // mer att söka i
  onClick: () => void
  onDelete?: () => void
}

const day = (d: string) => new Date(d).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
const month = (d: string) => {
  const s = new Date(d).toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' })
  return s[0].toUpperCase() + s.slice(1)
}

// Loggen: allt som har köpts och gjorts i hemmet, senast först.
export function Log({ state, open, onPhotos, onAdd }: ViewProps & { onPhotos: (room: string | null) => void; onAdd: () => void }) {
  const [q, setQ] = useState('')
  const roomName = (id: string | null) => state.rooms.find((r) => r.id === id)?.name

  const entries: Entry[] = [
    ...state.purchases.filter((p) => p.bought).map((p) => ({
      key: p.id,
      date: p.bought_on ?? p.created_at.slice(0, 10),
      order: p.created_at,
      title: p.title,
      meta: [roomName(p.room_id), p.store, p.stays ? 'Följer med lägenheten' : null],
      details: p.details,
      amount: paid(p),
      file: p.receipt_path,
      warning: needsInfo(p) ? 'Belopp saknas' : undefined,
      icon: IconShoppingBag,
      extra: [p.note],
      onClick: () => open({ t: 'purchase', item: p }),
      onDelete: () => removeRow(state, 'purchases', p.id, p.title),
    })),
    ...state.tasks.filter((t) => t.status === 'done').map((t) => ({
      key: t.id,
      date: t.done_on ?? t.created_at.slice(0, 10),
      order: t.created_at,
      title: t.title,
      meta: [roomName(t.room_id)],
      details: t.details,
      amount: Number(t.cost) || 0,
      file: t.receipt_path,
      icon: IconTool,
      extra: [t.note],
      onClick: () => open({ t: 'task', item: t }),
      onDelete: () => removeRow(state, 'tasks', t.id, t.title),
    })),
    // Bilder som togs samma dag i samma rum blir en rad.
    ...Object.values(
      state.photos
        .filter((p) => p.kind !== 'inspo')
        .reduce<Record<string, Photo[]>>((g, p) => {
          const k = `${p.created_at.slice(0, 10)}|${p.room_id ?? ''}`
          ;(g[k] ??= []).push(p)
          return g
        }, {}),
    ).map((ps) => ({
      key: ps[0].id,
      date: ps[0].created_at.slice(0, 10),
      order: ps[ps.length - 1].created_at,
      title: ps.length === 1 ? (ps[0].kind === 'before' ? 'Förebild' : 'Efterbild') : `${ps.length} bilder`,
      meta: [roomName(ps[0].room_id)],
      details: null,
      amount: 0,
      file: null,
      photos: ps,
      icon: IconPhoto,
      extra: [],
      onClick: () => onPhotos(ps[0].room_id),
    })),
  ]
  const text = (e: Entry) => [e.title, ...e.meta, ...e.extra, ...(e.details ?? []).flatMap((d) => [d.label, d.value])].filter(Boolean).join(' ').toLowerCase()

  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  const shown = entries
    .filter((e) => !words.length || words.every((w) => text(e).includes(w)))
    .sort((a, b) => b.date.localeCompare(a.date) || b.order.localeCompare(a.order))

  const groups: { month: string; entries: Entry[] }[] = []
  for (const e of shown) {
    const m = month(e.date)
    if (groups[groups.length - 1]?.month !== m) groups.push({ month: m, entries: [] })
    groups[groups.length - 1].entries.push(e)
  }
  const total = entries.reduce((s, e) => s + e.amount, 0)

  return (
    <div>
      <div className="section-head">
        <h1>Logg</h1>
        <button className="btn btn--ghost" onClick={onAdd}>Skriv in</button>
      </div>

      {entries.length === 0 ? (
        <div className="empty">
          <h2>Loggen är tom</h2>
          <p className="meta">Här samlas allt du köper och gör i hemmet, med datum, kvitton och färgkoder.</p>
          <button className="btn btn--secondary" onClick={() => open({ t: 'receipt' })}>Fota ett kvitto</button>
          <button className="btn btn--ghost" onClick={onAdd}>Skriv in utan bild</button>
        </div>
      ) : (
        <>
          <div className="log-head">
            <label className="search" style={{ maxWidth: 'none' }}>
              <IconSearch size={16} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sök, t.ex. färgkod eller butik" />
            </label>
            <span className="meta">{entries.length} saker · {kr(total)}</span>
          </div>

          {groups.length === 0 && <div className="empty"><h2>Inget hittades</h2></div>}
          {groups.map((g) => (
            <div key={g.month} className="section" style={{ marginTop: 'var(--s-4)' }}>
              <div className="section-head">
                <h2>{g.month}</h2>
                {g.entries.some((e) => e.amount > 0) && <span className="meta">{kr(g.entries.reduce((s, e) => s + e.amount, 0))}</span>}
              </div>
              <div className="rows">
                <AnimatePresence initial={false}>
                  {g.entries.map((e) => {
                    const body = (
                      <>
                        <div className="row__main">
                          <LogThumb e={e} urls={state.urls} />
                          <div className="row__text">
                            <div className="row__title">{e.title}</div>
                            <div className="meta">{[day(e.date), ...e.meta].filter(Boolean).join(' · ')}</div>
                            <DetailsList details={e.details} />
                            {e.warning && <span className="status status--warning">{e.warning}</span>}
                          </div>
                        </div>
                        {e.amount > 0 && <span className="row__amount">{kr(e.amount)}</span>}
                      </>
                    )
                    return e.onDelete ? (
                      <SwipeRow key={e.key} onClick={e.onClick} onDelete={e.onDelete}>{body}</SwipeRow>
                    ) : (
                      <motion.div key={e.key} layout="position" {...rowAnim} className="row" onClick={e.onClick}>{body}</motion.div>
                    )
                  })}
                </AnimatePresence>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

function LogThumb({ e, urls }: { e: Entry; urls: Record<string, string> }) {
  if (e.file) return <FileThumb path={e.file} url={urls[e.file]} />
  const photo = e.photos?.find((p) => p.url)
  if (photo) return <span className="thumb" style={{ width: 40, height: 40 }}><img src={photo.url} alt="" /></span>
  return <span className="thumb" style={{ width: 40, height: 40 }}><e.icon size={18} /></span>
}
