import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { kr } from '../lib/format'

// Rörelsen när graferna visas: glider ut från noll och saktar in mot slutet.
export const grow = { duration: 1.1, ease: [0.2, 0.8, 0.2, 1] as const, delay: 0.15 }

// ---------------------------------------------------------------------------
// Halvcirkelmätare av streck, i ren SVG. Hela bågen är 100 %; strecken fram till `share` fylls i
// accentfärgen, ett i taget från vänster, resten ligger kvar som ett svagt spår. Siffran står i mitten.
// ---------------------------------------------------------------------------
const TICKS = 38
const CX = 100, CY = 100, R_IN = 64, R_OUT = 88

const ticks = Array.from({ length: TICKS }, (_, i) => {
  const a = Math.PI - (i / (TICKS - 1)) * Math.PI   // från vänster (180°) till höger (0°)
  const cos = Math.cos(a), sin = Math.sin(a)
  return { x1: CX + R_IN * cos, y1: CY - R_IN * sin, x2: CX + R_OUT * cos, y2: CY - R_OUT * sin }
})

export function Gauge({ share, label, children }: { share: number; label: string; children?: ReactNode }) {
  const still = useReducedMotion()
  // Minst ett streck så fort något är betalt, så att början syns.
  const filled = share > 0 ? Math.max(1, Math.round(Math.min(1, share) * TICKS)) : 0

  return (
    <div className="gauge" role="img" aria-label={label}>
      <svg viewBox="0 0 200 104" className="gauge__svg">
        {ticks.map((t, i) => <line key={i} {...t} className="gauge__tick" />)}
        <g className="gauge__fill">
          {ticks.slice(0, filled).map((t, i) => (
            <motion.line
              key={i}
              {...t}
              className="gauge__tick is-on"
              style={{ opacity: still ? 0.55 + 0.45 * (i / Math.max(1, filled - 1)) : undefined }}
              initial={still ? false : { opacity: 0 }}
              animate={{ opacity: 0.55 + 0.45 * (i / Math.max(1, filled - 1)) }}
              transition={{ duration: 0.25, delay: grow.delay + i * 0.035 }}
            />
          ))}
        </g>
      </svg>
      <div className="gauge__center">{children}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stapeldiagram: ett nästan osynligt spår till full höjd bakom varje stapel, beloppet ovanför stapeln
// och etiketten under. Staplar med tone "accent" lyser i accentfärgen.
// ---------------------------------------------------------------------------
export interface Bar { label: string; amount: number; tone?: 'accent' }

export function MiniBars({ bars }: { bars: Bar[] }) {
  const still = useReducedMotion()
  const max = Math.max(...bars.map((b) => b.amount), 1)
  return (
    <div className="minibars" role="img" aria-label={bars.map((b) => `${b.label} ${kr(b.amount)}`).join(', ')}>
      {bars.map((b, i) => {
        const h = Math.max(6, (b.amount / max) * 100)
        return (
          <div key={b.label} className="minibars__col">
            <div className="minibars__track">
              <motion.div
                className={`minibars__bar ${b.tone === 'accent' ? 'is-accent' : ''}`}
                initial={still ? false : { height: 0 }}
                animate={{ height: `${h}%` }}
                transition={{ ...grow, delay: grow.delay + i * 0.07 }}
              >
                <span className="minibars__value">{kr(b.amount)}</span>
              </motion.div>
            </div>
            <span className="minibars__label" title={b.label}>{b.label}</span>
          </div>
        )
      })}
    </div>
  )
}
