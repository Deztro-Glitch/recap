import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  IconCheck, IconDimensions, IconFilter, IconFridge, IconRulerMeasure, IconScan, IconToolsKitchen2, IconWallOff, IconWashMachine,
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
// Smart underhåll & vitvaror: en yta för att skanna kvitto eller vitvara, och en ring per sak som behöver
// skötas. Ringen visar hur stor del av intervallet som har gått: grön strax efter, orange när det närmar sig,
// röd när det är dags. Bocken ("gjort") nollställer ringen.
// ---------------------------------------------------------------------------
type Care = { id: string; name: string; icon: typeof IconFilter; every: number; doneDaysAgo: number }

// Exempel tills underhållet sparas i databasen. Intervall och senast gjort i dagar.
const EXAMPLES: Care[] = [
  { id: 'flakt', name: 'Filter köksfläkt', icon: IconFilter, every: 90, doneDaysAgo: 76 },
  { id: 'disk', name: 'Rengöring diskmaskin', icon: IconToolsKitchen2, every: 30, doneDaysAgo: 6 },
  { id: 'tvatt', name: 'Rengöring tvättmaskin', icon: IconWashMachine, every: 60, doneDaysAgo: 41 },
  { id: 'frys', name: 'Frosta av frysen', icon: IconFridge, every: 180, doneDaysAgo: 175 },
]

const toneFor = (share: number) => (share >= 0.9 ? 'var(--care-due)' : share >= 0.6 ? 'var(--care-soon)' : 'var(--care-ok)')
const days = (n: number) => `${n} ${n === 1 ? 'dag' : 'dagar'}`
const whenText = (left: number) => (left < 0 ? `${days(-left)} sen` : left === 0 ? 'Dags i dag' : `Om ${days(left)}`)

export function CareSection({ onFiles }: { onFiles: (files: FileList) => void }) {
  const [items, setItems] = useState(EXAMPLES)
  const done = (id: string) => setItems((cur) => cur.map((c) => (c.id === id ? { ...c, doneDaysAgo: 0 } : c)))

  return (
    <section className="care section">
      <div className="section-head"><h2>Smart underhåll & vitvaror</h2></div>
      <div className="care__grid">
        <ScanDrop onFiles={onFiles} />
        <div className="care__cards">
        {items.map((c, i) => {
          const share = c.doneDaysAgo / c.every
          const tone = toneFor(share)
          return (
            <motion.div key={c.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.1 + i * 0.06 }}>
              <GlassCard className="care-card">
                <ActivityRing share={share} color={tone} label={`${c.name}: ${Math.round(share * 100)} % av intervallet har gått`}>
                  <c.icon size={22} stroke={1.8} />
                </ActivityRing>
                <div className="care-card__text">
                  <span className="care-card__name">{c.name}</span>
                  <span className="care-card__when" style={share >= 0.6 ? { color: tone } : undefined}>{whenText(c.every - c.doneDaysAgo)}</span>
                  <span className="meta">Var {days(c.every)}</span>
                </div>
                <button type="button" className="care-card__done" onClick={() => done(c.id)} disabled={c.doneDaysAgo === 0} aria-label={`${c.name}: gjort`}>
                  <IconCheck size={16} stroke={2.4} />
                </button>
              </GlassCard>
            </motion.div>
          )
        })}
        </div>
      </div>
    </section>
  )
}

// Dra och släpp eller tryck: bilden går vidare till appens vanliga fråga "Vad är bilden?" (kvitto, foto …).
function ScanDrop({ onFiles }: { onFiles: (files: FileList) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  return (
    <motion.div className="scan-wrap" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <GlassCard
        className={`scan ${over ? 'is-over' : ''}`}
        onClick={() => input.current?.click()}
        onDragOver={(e: React.DragEvent) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={(e: React.DragEvent) => {
          e.preventDefault()
          setOver(false)
          if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files)
        }}
      >
        <span className="scan__icon"><IconScan size={26} stroke={1.7} /></span>
        <span className="scan__title">Skanna kvitto eller vitvara</span>
        <span className="meta">{over ? 'Släpp här' : 'Dra hit en bild eller tryck'}</span>
        <input ref={input} type="file" accept="image/*,application/pdf" hidden onClick={(e) => e.stopPropagation()} onChange={(e) => { if (e.target.files?.length) onFiles(e.target.files); e.target.value = '' }} />
      </GlassCard>
    </motion.div>
  )
}
