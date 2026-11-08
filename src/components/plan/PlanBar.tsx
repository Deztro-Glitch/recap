import { useState } from 'react'
import { IconArrowBackUp, IconArrowsMaximize, IconArrowsMinimize, IconDots } from '@tabler/icons-react'
import { Loader } from '../ui'
import type { Room } from '../../types'
import type { usePlanEditor } from './usePlanEditor'

// Rubriken ovanför ritningen och det som hör till den: verktygen bakom tre prickar (Hitta rum, Justera, Byt bild),
// Förstora, förloppet när rummen läses och raden med knappar när man justerar rummen.
export function PlanBar({ ed, rooms, detecting, expanded, onExpand, onDetect, onReplace, onAddRoom }: {
  ed: ReturnType<typeof usePlanEditor>
  rooms: Room[]
  detecting: number | null
  expanded: boolean
  onExpand?: () => void
  onDetect: () => void
  onReplace: () => void
  onAddRoom: () => void
}) {
  const [tools, setTools] = useState(false)
  const selRoom = ed.selected ? rooms.find((r) => r.id === ed.selected) : undefined
  const missing = rooms.filter((r) => !ed.polys[r.id])

  return (
    <>
      <div className="section-head">
        <h2>Planritning</h2>
        {!ed.editing && detecting === null && (
          <button className="btn btn--ghost" aria-label="Verktyg för planritningen" aria-expanded={tools} onClick={() => setTools(!tools)}>
            <IconDots size={18} />
          </button>
        )}
        {onExpand && !ed.editing && detecting === null && (
          <button className="btn btn--ghost plan__expand" aria-label={expanded ? 'Förminska ritningen' : 'Förstora ritningen'} onClick={onExpand}>
            {expanded ? <IconArrowsMinimize size={18} /> : <IconArrowsMaximize size={18} />}
          </button>
        )}
        {ed.editing && (
          <>
            <button className="btn btn--ghost" aria-label="Ångra" disabled={!ed.canUndo} onClick={ed.undoLast}>
              <IconArrowBackUp size={18} />
            </button>
            <button className="btn btn--secondary" onClick={ed.finish}>Klar</button>
          </>
        )}
      </div>

      {/* Verktygen behövs sällan, så de ligger bakom knappen med tre prickar. */}
      {tools && !ed.editing && detecting === null && (
        <div className="plan-tools" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 'var(--s-2)' }}>
          <button className="btn btn--secondary" onClick={() => { setTools(false); onDetect() }}>Hitta rum</button>
          <button className="btn btn--ghost" onClick={() => { setTools(false); ed.setEditing(true) }}>Justera rummen</button>
          <button className="btn btn--ghost" onClick={() => { setTools(false); onReplace() }}>Byt bild</button>
        </div>
      )}

      {detecting !== null && (
        <div className="plan-tools">
          <Loader />
          <span className="status status--sent">{detecting > 0 ? `Läser rumsnamnen i ritningen, ${Math.round(detecting * 100)} %` : 'Förbereder läsningen av ritningen'}</span>
        </div>
      )}

      {ed.editing && (
        <div className="plan-tools">
          {selRoom ? (
            <div className="chips">
              <span className="status status--sent" style={{ marginRight: 'auto' }}>{selRoom.name}: dra i hörnen</span>
              {ed.vertex !== null && ed.sel && ed.sel.length > 3 && (
                <button className="chip" onClick={ed.removeVertex}>Ta bort hörn</button>
              )}
              <button className="chip" onClick={ed.removeRoom}>Ta bort från ritningen</button>
            </div>
          ) : ed.picking ? (
            <div className="chips">
              {missing.map((r) => <button key={r.id} className="chip" onClick={() => ed.place(r)}>{r.name}</button>)}
              <button className="chip" onClick={() => { ed.setPicking(false); onAddRoom() }}>Nytt rum</button>
            </div>
          ) : (
            <div className="chips">
              <span className="status status--sent" style={{ marginRight: 'auto' }}>Tryck på ett rum för att ändra det</span>
              <button className="chip" onClick={() => ed.setPicking(true)}>Lägg till rum</button>
            </div>
          )}
        </div>
      )}
    </>
  )
}
