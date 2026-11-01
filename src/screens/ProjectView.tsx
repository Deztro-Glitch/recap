import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { IconArrowLeft, IconBulb, IconChevronLeft, IconChevronRight, IconHammer, IconLayoutGrid, IconPhoto, IconReceipt, IconSettings, IconShoppingCart } from '@tabler/icons-react'
import type { User } from '../lib/api'
import { kr } from '../lib/format'
import { useBudget, useProject } from '../lib/useProject'
import { NavItem, Shell } from '../components/Shell'
import { Chips, Loader, Primary, ease } from '../components/ui'
import { KIND_LABEL, PHASES, type Room, type Task } from '../types'
import { Overview } from './tabs/Overview'
import { Purchases } from './tabs/Purchases'
import { Timeline } from './tabs/Timeline'
import { Photos } from './tabs/Photos'
import { Settings } from './tabs/Settings'
import { Receipts } from './tabs/Receipts'
import { Ideas } from './tabs/Ideas'

const VIEWS = [
  { id: 'overview', label: 'Översikt', icon: IconLayoutGrid, action: 'Lägg till rum' },
  { id: 'purchases', label: 'Inköp', icon: IconShoppingCart, action: 'Lägg till inköp' },
  { id: 'receipts', label: 'Kvitton', icon: IconReceipt, action: 'Lägg till kvitto' },
  { id: 'timeline', label: 'Renovering', icon: IconHammer, action: 'Lägg till jobb' },
  { id: 'ideas', label: 'Idéer', icon: IconBulb, action: 'Lägg till idé' },
  { id: 'photos', label: 'Foton', icon: IconPhoto, action: 'Lägg till foto' },
  { id: 'settings', label: 'Inställningar', icon: IconSettings, action: 'Spara ändringar' },
] as const
type ViewId = (typeof VIEWS)[number]['id']

export type ProjectState = ReturnType<typeof useProject>

// Det som varje vy får: data, filter och om "Lägg till"-panelen är öppen.
export interface ViewProps {
  state: ProjectState
  room: string | null
  q: string
  adding: boolean
  setAdding: (v: boolean) => void
}

// Första fasen som har ogjorda jobb är den man står i.
export const currentPhase = (tasks: Task[]) => {
  const i = PHASES.findIndex((_, p) => tasks.some((t) => t.phase === p && t.status !== 'done'))
  return i === -1 ? (tasks.length ? PHASES.length - 1 : 0) : i
}

export function ProjectView({ pid, user, onBack }: { pid: string; user: User; onBack: () => void }) {
  const state = useProject(pid)
  const [view, setView] = useState<ViewId>('overview')
  const [room, setRoom] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const [phase, setPhase] = useState<number | null>(null)
  const b = useBudget(state.project, state.purchases, state.tasks)

  const now = currentPhase(state.tasks)
  const viewing = phase ?? now

  useEffect(() => setAdding(false), [view])

  if (!state.loading && !state.project) {
    return (
      <div className="auth">
        <main className="main empty">
          <h1>Hemmet finns inte</h1>
          <button className="btn btn--secondary" onClick={onBack}>Till mina hem</button>
        </main>
      </div>
    )
  }

  const go = (to: ViewId, roomId: string | null = room) => {
    setView(to)
    setRoom(roomId)
  }
  const showPhase = (p: number) => {
    setPhase(Math.max(0, Math.min(PHASES.length - 1, p)))
    setView('timeline')
  }

  const current = VIEWS.find((v) => v.id === view)!
  const props: ViewProps = { state, room, q, adding, setAdding }

  const processbar = state.project && (
    <footer className="processbar">
      <div className="processbar__context">
        <strong>{state.project.name}</strong>
        <span className="meta">{state.project.address || KIND_LABEL[state.project.kind]}</span>
      </div>
      <button className="processbar__nav" data-go="-1" aria-label="Föregående fas" onClick={() => showPhase(viewing - 1)}>
        <IconChevronLeft size={18} />
      </button>
      <div className="steps">
        {PHASES.map((p, i) => {
          const pt = state.tasks.filter((t) => t.phase === i)
          const done = i < now || (pt.length > 0 && pt.every((t) => t.status === 'done'))
          return (
            <button
              key={p.name}
              className={`step ${done ? 'is-done' : ''} ${i === now && !done ? 'is-current' : ''} ${view === 'timeline' && i === viewing ? 'is-viewing' : ''}`}
              onClick={() => showPhase(i)}
              aria-label={p.name}
            >
              <span className="step__track" />
              <span className="step__label">{p.name}</span>
            </button>
          )
        })}
      </div>
      <button className="processbar__nav" data-go="1" aria-label="Nästa fas" onClick={() => showPhase(viewing + 1)}>
        <IconChevronRight size={18} />
      </button>
      <div className="processbar__total">
        <span className="display">{kr(b.spent)}</span>
        {b.overSpent ? <span className="status status--lost">Över budget</span> : <span className="meta">{b.budget ? `av ${kr(b.budget)}` : 'spenderat'}</span>}
      </div>
      {view === 'settings' ? (
        <Primary type="submit" form="settings-form">{current.action}</Primary>
      ) : (
        <Primary onClick={() => setAdding(true)}>{current.action}</Primary>
      )}
    </footer>
  )

  return (
    <Shell
      user={user}
      onAvatar={() => go('settings')}
      search={{ value: q, onChange: setQ, placeholder: 'Sök inköp, jobb eller rum' }}
      nav={
        <>
          <NavItem icon={IconArrowLeft} label="Mina hem" onClick={onBack} />
          {VIEWS.map((v) => (
            <NavItem key={v.id} icon={v.icon} label={v.label} active={view === v.id} onClick={() => go(v.id)} />
          ))}
        </>
      }
      processbar={processbar}
    >
      {state.loading ? (
        <Loader />
      ) : (
        <AnimatePresence mode="wait">
          <motion.div key={view} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25, ease }}>
            {view === 'overview' && <Overview {...props} onGo={(v, id) => go(v, id)} onShowPhase={showPhase} />}
            {view === 'purchases' && <Purchases {...props} filter={<RoomFilter rooms={state.rooms} value={room} onChange={setRoom} />} />}
            {view === 'receipts' && <Receipts {...props} filter={<RoomFilter rooms={state.rooms} value={room} onChange={setRoom} />} />}
            {view === 'ideas' && <Ideas {...props} filter={<RoomFilter rooms={state.rooms} value={room} onChange={setRoom} />} />}
            {view === 'timeline' && <Timeline {...props} phase={viewing} onPhase={showPhase} filter={<RoomFilter rooms={state.rooms} value={room} onChange={setRoom} />} />}
            {view === 'photos' && <Photos {...props} filter={<RoomFilter rooms={state.rooms} value={room} onChange={setRoom} />} />}
            {view === 'settings' && <Settings {...props} user={user} onDeleted={onBack} />}
          </motion.div>
        </AnimatePresence>
      )}
    </Shell>
  )
}

function RoomFilter({ rooms, value, onChange }: { rooms: Room[]; value: string | null; onChange: (id: string | null) => void }) {
  return <Chips value={value} onChange={onChange} options={[{ value: null, label: 'Alla rum' }, ...rooms.map((r) => ({ value: r.id as string | null, label: r.name }))]} />
}
