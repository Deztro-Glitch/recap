import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  IconCheck, IconDimensions, IconFilter, IconFridge, IconRulerMeasure, IconToolsKitchen2, IconWallOff, IconWashMachine,
} from '@tabler/icons-react'
import { GlassCard } from '../../components/GlassCard'
import { ActivityRing } from '../../components/Charts'
import type { PlanTool } from '../../components/FloorPlan'

// ---------------------------------------------------------------------------
// Verktygslådan bredvid planritningen: ett smalt glaskort med ikoner. Namnet glider fram när man håller
// över, det valda verktyget lyser i accentfärgen och markeringen glider mellan verktygen.
// ---------------------------------------------------------------------------
const TOOLS: { id: PlanTool; label: string; icon: typeof IconRulerMeasure }[] = [
  { id: 'measure', label: 'Mät dimensioner', icon: IconRulerMeasure },
  { id: 'demolish', label: 'Markera vägg för rivning', icon: IconWallOff },
  { id: 'area', label: 'Kalkylera yta', icon: IconDimensions },
]

export function PlanToolbox({ tool, onTool }: { tool: PlanTool | null; onTool: (t: PlanTool | null) => void }) {
  const [hover, setHover] = useState<PlanTool | null>(null)

  // Esc lägger tillbaka verktyget.
  useEffect(() => {
    if (!tool) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onTool(null)
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [tool])

  return (
    <GlassCard className="toolbox" lift={false} role="toolbar" aria-label="Verktyg för planritningen">
      {TOOLS.map((t) => {
        const on = tool === t.id
        return (
          <div key={t.id} className="toolbox__slot" onMouseEnter={() => setHover(t.id)} onMouseLeave={() => setHover(null)}>
            <motion.button
              type="button"
              className={`toolbox__btn ${on ? 'is-active' : ''}`}
              aria-pressed={on}
              aria-label={t.label}
              onClick={() => onTool(on ? null : t.id)}
              onFocus={() => setHover(t.id)}
              onBlur={() => setHover(null)}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            >
              {on && <motion.span layoutId="toolbox-active" className="toolbox__glow" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
              <t.icon size={20} stroke={1.8} />
            </motion.button>
            <AnimatePresence>
              {hover === t.id && (
                <motion.span
                  className="toolbox__tip"
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -4 }}
                  transition={{ duration: 0.18 }}
                >
                  {t.label}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        )
      })}
    </GlassCard>
  )
}

// ---------------------------------------------------------------------------
// Underhåll: en ring per sak som behöver skötas. Ringen visar hur stor del av intervallet som har gått och byter
// färg från blå/grön till orange/röd ju närmare det är. Bocken ("gjort") nollställer ringen.
// ---------------------------------------------------------------------------
// thing och todo är den korta varningen på Översikten, t.ex. "Köksfläkt: Dags att byta filter".
export type Care = { id: string; thing: string; todo: string; name: string; icon: typeof IconFilter; every: number; doneDaysAgo: number }

// Exempel tills underhållet sparas i databasen. Intervall och senast gjort i dagar.
const EXAMPLES: Care[] = [
  { id: 'flakt', name: 'Filter köksfläkt', thing: 'Köksfläkt', todo: 'Dags att byta filter', icon: IconFilter, every: 90, doneDaysAgo: 76 },
  { id: 'disk', name: 'Rengöring diskmaskin', thing: 'Diskmaskin', todo: 'Dags att rengöra', icon: IconToolsKitchen2, every: 30, doneDaysAgo: 16 },
  { id: 'tvatt', name: 'Rengöring tvättmaskin', thing: 'Tvättmaskin', todo: 'Dags att rengöra', icon: IconWashMachine, every: 60, doneDaysAgo: 12 },
  { id: 'frys', name: 'Frosta av frysen', thing: 'Frysen', todo: 'Dags att frosta av', icon: IconFridge, every: 180, doneDaysAgo: 175 },
]

// Blå när det är långt kvar, grön en bit in, orange när det närmar sig och röd när det är dags.
const toneFor = (share: number) => (share >= 0.9 ? 'var(--care-due)' : share >= 0.65 ? 'var(--care-soon)' : share >= 0.3 ? 'var(--care-ok)' : 'var(--care-fresh)')
const days = (n: number) => `${n} ${n === 1 ? 'dag' : 'dagar'}`
const whenText = (left: number) => (left < 0 ? `${days(-left)} sen` : left === 0 ? 'Dags i dag' : `Om ${days(left)}`)

// Underhållet delas mellan Översiktens statuskort och Smart underhåll, så att en bock syns på båda ställena.
export function useCare() {
  const [items, setItems] = useState(EXAMPLES)
  const done = (id: string) => setItems((cur) => cur.map((c) => (c.id === id ? { ...c, doneDaysAgo: 0 } : c)))
  return { items, done }
}
// Det som snart är dags (minst 80 % av intervallet har gått), det mest bråttom först.
export const careWarnings = (items: Care[]) => items.filter((c) => c.doneDaysAgo / c.every >= 0.8).sort((a, b) => b.doneDaysAgo / b.every - a.doneDaysAgo / a.every)

// Underhållet som en kompakt lista i panelen bredvid ritningen: en liten ring per sak, när det är dags och en bock.
export function CareList({ items, done }: { items: Care[]; done: (id: string) => void }) {
  // Det som är närmast på tur först.
  const sorted = [...items].sort((a, b) => b.doneDaysAgo / b.every - a.doneDaysAgo / a.every)
  return (
    <div className="section care-list" id="care">
      <div className="section-head"><h3>Underhåll</h3></div>
      <div className="rows">
        {sorted.map((c, i) => {
          const share = c.doneDaysAgo / c.every
          const tone = toneFor(share)
          return (
            <motion.div key={c.id} layout className="care-row" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 + i * 0.05 }}>
              <ActivityRing share={share} color={tone} size={40} label={`${c.name}: ${Math.round(share * 100)} % av intervallet har gått`}>
                <c.icon size={16} stroke={1.9} />
              </ActivityRing>
              <div className="care-row__text">
                <span className="care-row__name">{c.name}</span>
                <span className="care-row__when" style={share >= 0.65 ? { color: tone } : undefined}>{whenText(c.every - c.doneDaysAgo)}</span>
              </div>
              <button type="button" className="care-card__done" onClick={() => done(c.id)} disabled={c.doneDaysAgo === 0} aria-label={`${c.name}: gjort`}>
                <IconCheck size={15} stroke={2.4} />
              </button>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
