import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { IconPhoto, IconShoppingBag, IconTool } from '@tabler/icons-react'
import { kr } from '../../lib/format'
import { FileThumb } from '../../components/FileField'
import { DetailsList } from '../../components/Details'
import { FilterBar, FilterToggle, isFiltered, matches, noFilter, type FilterState } from '../../components/Filters'
import { SwipeRow } from '../../components/SwipeRow'
import { Chips, rowAnim } from '../../components/ui'
import type { Photo } from '../../types'
import type { ViewProps } from '../ProjectView'
import { ItemTags, allItems, itemText, removeRow, sheetFor, type Item } from './Items'
import { PhotoGrid } from './Photos'

interface Entry {
  key: string
  date: string
  order: string
  title: string
  meta: (string | null | undefined)[]
  amount: number
  item?: Item
  photos?: Photo[]
  onClick: () => void
}

const day = (d: string) => new Date(d).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
const month = (d: string) => {
  const s = new Date(d).toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' })
  return s[0].toUpperCase() + s.slice(1)
}

// Loggen: allt som har köpts och gjorts i hemmet, senast först. Som lista eller som bildgalleri.
export function Log({ state, open }: ViewProps) {
  const [filter, setFilter] = useState<FilterState>(noFilter)
  const [view, setView] = useState<'list' | 'gallery'>('list')
  const [showFilter, setShowFilter] = useState(false)
  const roomName = (id: string | null) => state.rooms.find((r) => r.id === id)?.name

  const items = allItems(state).filter((it) => it.done && matches(filter, { ...it, text: itemText(it, roomName(it.room_id)) }))
  // Bilder har ingen märkning, så de visas bara när man inte filtrerar på det.
  const photos = filter.flag === 'all' ? state.photos.filter((p) => matches(filter, { room_id: p.room_id, stays: false, k6: false, text: (roomName(p.room_id) ?? '').toLowerCase() })) : []

  const entries: Entry[] = [
    ...items.map((it) => ({
      key: it.id,
      date: it.date ?? it.created_at.slice(0, 10),
      order: it.created_at,
      title: it.title,
      meta: [roomName(it.room_id), it.store],
      amount: it.amount,
      item: it,
      onClick: () => open(sheetFor(it)),
    })),
    // Bilder som togs samma dag i samma rum blir en rad.
    ...Object.values(
      photos.reduce<Record<string, Photo[]>>((g, p) => {
        const k = `${p.created_at.slice(0, 10)}|${p.room_id ?? ''}`
        ;(g[k] ??= []).push(p)
        return g
      }, {}),
    ).map((ps) => ({
      key: ps[0].id,
      date: ps[0].created_at.slice(0, 10),
      order: ps[ps.length - 1].created_at,
      title: ps.length === 1 ? 'En bild' : `${ps.length} bilder`,
      meta: [roomName(ps[0].room_id)],
      amount: 0,
      photos: ps,
      onClick: () => {
        setFilter({ ...filter, room: ps[0].room_id ?? '' })
        setView('gallery')
      },
    })),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.order.localeCompare(a.order))

  const groups: { month: string; entries: Entry[] }[] = []
  for (const e of entries) {
    const m = month(e.date)
    if (groups[groups.length - 1]?.month !== m) groups.push({ month: m, entries: [] })
    groups[groups.length - 1].entries.push(e)
  }
  const missing = entries.filter((e) => e.item?.missing)

  return (
    <div>
      <div className="section-head">
        <h1>Logg</h1>
        <Chips value={view} onChange={setView} options={[{ value: 'list', label: 'Lista' }, { value: 'gallery', label: 'Bilder' }]} />
        <FilterToggle open={showFilter} active={isFiltered(filter)} onClick={() => setShowFilter(!showFilter)} />
      </div>
      <FilterBar state={state} value={filter} onChange={setFilter} open={showFilter} placeholder="Sök, t.ex. färgkod eller butik" />

      {view === 'gallery' ? (
        <div className="section">
          {photos.length ? <PhotoGrid state={state} photos={[...photos].reverse()} showRoom={!filter.room} /> : <p className="meta">Inga bilder</p>}
        </div>
      ) : (
        <>
          {missing.length > 0 && (
            <button className="btn btn--secondary" style={{ marginTop: 'var(--s-4)' }} onClick={missing[0].onClick}>
              {missing.length === 1 ? 'Ett kvitto saknar belopp' : `${missing.length} kvitton saknar belopp`}
            </button>
          )}
          {groups.length === 0 && <div className="empty"><h2>Inget här än</h2></div>}
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
                            {e.item && <DetailsList details={e.item.details} />}
                            {e.item && <ItemTags it={e.item} />}
                          </div>
                        </div>
                        {e.amount > 0 && <span className="row__amount">{kr(e.amount)}</span>}
                      </>
                    )
                    return e.item ? (
                      <SwipeRow key={e.key} onClick={e.onClick} onDelete={() => removeRow(state, e.item!.table, e.item!.id, e.item!.title)}>{body}</SwipeRow>
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
  const file = e.item?.file
  if (file) return <FileThumb path={file} url={urls[file]} />
  const photo = e.photos?.find((p) => p.url)
  if (photo) return <span className="thumb" style={{ width: 40, height: 40 }}><img src={photo.url} alt="" /></span>
  const Icon = e.photos ? IconPhoto : e.item?.table === 'tasks' ? IconTool : IconShoppingBag
  return <span className="thumb" style={{ width: 40, height: 40 }}><Icon size={18} /></span>
}
