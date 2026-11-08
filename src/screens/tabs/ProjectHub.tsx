import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  IconCheck, IconCoins, IconDimensions, IconDroplet, IconFilter, IconFlame, IconFridge, IconRulerMeasure, IconShieldCheck, IconTool,
  IconToolsKitchen2, IconWallOff, IconWashMachine, IconWind,
} from '@tabler/icons-react'
import { api } from '../../lib/api'
import { careItems, untilText, warranties, whenText } from '../../lib/care'
import type { ProjectState, ViewProps } from '../view'
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
  { id: 'cost', label: 'Kostnadskarta', icon: IconCoins },
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
// Underhåll: en ring per sak som behöver skötas (tabellen maintenance). Ringen visar hur stor del av intervallet
// som har gått och byter färg från blå/grön till orange/röd ju närmare det är. Bocken ("gjort") nollställer ringen,
// och raden öppnar underhållet. Under listan står garantierna som inte har gått ut.
// ---------------------------------------------------------------------------

// Blå när det är långt kvar, grön en bit in, orange när det närmar sig och röd när det är dags.
export const toneFor = (share: number) => (share >= 0.9 ? 'var(--care-due)' : share >= 0.65 ? 'var(--care-soon)' : share >= 0.3 ? 'var(--care-ok)' : 'var(--care-fresh)')

// En ikon från namnet, så att listan går att skumma.
export function careIcon(name: string) {
  const n = name.toLowerCase()
  if (/fläkt|filter/.test(n)) return IconFilter
  if (/disk/.test(n)) return IconToolsKitchen2
  if (/tvätt|tork/.test(n)) return IconWashMachine
  if (/frys|kyl/.test(n)) return IconFridge
  if (/brand|rök/.test(n)) return IconFlame
  if (/brunn|avlopp|vatten|kran/.test(n)) return IconDroplet
  if (/ventil|luft/.test(n)) return IconWind
  return IconTool
}

// Bocken: gjort i dag.
export const markCareDone = async (state: ProjectState, id: string) => {
  await api.update('maintenance', id, { last_done: new Date().toISOString().slice(0, 10) })
  await state.reload()
}

export function CareList({ state, open }: ViewProps) {
  const items = careItems(state)
  const list = warranties(state)
  if (!items.length && !list.length) return null
  return (
    <div className="section care-list" id="care">
      {items.length > 0 && (
        <>
          <div className="section-head"><h3>Underhåll</h3></div>
          <div className="rows">
            {items.map((c, i) => {
              const tone = toneFor(c.share)
              const Icon = careIcon(c.name)
              return (
                <motion.div key={c.id} layout className="care-row" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 + i * 0.05 }}
                  role="button" tabIndex={0} onClick={() => open({ t: 'maintenance', item: c.raw })} onKeyDown={(e) => e.key === 'Enter' && open({ t: 'maintenance', item: c.raw })}>
                  <ActivityRing share={Math.min(1, c.share)} color={tone} size={40} label={`${c.name}: ${Math.round(Math.min(1, c.share) * 100)} % av intervallet har gått`}>
                    <Icon size={16} stroke={1.9} />
                  </ActivityRing>
                  <div className="care-row__text">
                    <span className="care-row__name">{c.name}</span>
                    <span className="care-row__when" style={c.share >= 0.65 ? { color: tone } : undefined}>{whenText(c.left)}</span>
                  </div>
                  <button type="button" className="care-card__done" onClick={(e) => { e.stopPropagation(); markCareDone(state, c.id) }} disabled={c.share === 0} aria-label={`${c.name}: gjort`}>
                    <IconCheck size={15} stroke={2.4} />
                  </button>
                </motion.div>
              )
            })}
          </div>
        </>
      )}
      {list.length > 0 && (
        <div className="section">
          <div className="section-head"><h3>Garantier</h3></div>
          <div className="rows">
            {list.map((w) => (
              <div key={w.id} className="care-row" role="button" tabIndex={0} onClick={() => open({ t: 'purchase', item: w.raw })} onKeyDown={(e) => e.key === 'Enter' && open({ t: 'purchase', item: w.raw })}>
                <span className={`care-row__shield ${w.left <= 60 ? 'is-soon' : ''}`}><IconShieldCheck size={18} stroke={1.8} /></span>
                <div className="care-row__text">
                  <span className="care-row__name">{w.title}</span>
                  <span className="care-row__when">{untilText(w)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
