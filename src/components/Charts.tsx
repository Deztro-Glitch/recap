import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { kr } from '../lib/format'

// Rörelsen när graferna visas: glider ut från noll och saktar in mot slutet.
export const grow = { duration: 1.1, ease: [0.2, 0.8, 0.2, 1] as const, delay: 0.15 }

// ---------------------------------------------------------------------------
// Halvcirkelmätare i ren SVG. Delarna läggs efter varandra längs bågen, med runda ändar och ett litet
// mellanrum. Andelarna är 0–1 av hela bågen. Innehållet (siffran) ligger i mitten under bågen.
// ---------------------------------------------------------------------------
export interface GaugePart { share: number; tone: 'debt' | 'own' | 'danger'; label: string }

const ARC = 'M 20 100 A 80 80 0 0 1 180 100'  // halvcirkel, radie 80, från vänster till höger
const GAP = 3                                // mellanrum mellan delarna, i procent av bågen (rymmer de runda ändarna)

export function Gauge({ parts, children }: { parts: GaugePart[]; children?: ReactNode }) {
  const still = useReducedMotion()
  let start = 0
  const drawn = parts.map((p, i) => {
    const from = start + (i > 0 ? GAP / 2 : 0)
    const to = start + p.share * 100 - (i < parts.length - 1 ? GAP / 2 : 0)
    start += p.share * 100
    return { ...p, from, len: Math.max(0, to - from) }
  })

  return (
    <div className="gauge" role="img" aria-label={parts.map((p) => `${p.label} ${Math.round(p.share * 100)} %`).join(', ')}>
      <svg viewBox="0 0 200 108" className="gauge__svg">
        <path d={ARC} pathLength={100} className="gauge__track" />
        {drawn.filter((p) => p.len > 0).map((p, i) => (
          <motion.path
            key={p.tone + i}
            d={ARC}
            pathLength={100}
            className={`gauge__part gauge__part--${p.tone}`}
            strokeDashoffset={-p.from}
            initial={still ? false : { strokeDasharray: '0 100' }}
            animate={{ strokeDasharray: `${p.len} 100` }}
            transition={{ ...grow, delay: grow.delay + i * 0.35 }}
          />
        ))}
      </svg>
      <div className="gauge__center">{children}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Minimalt stapeldiagram: en stapel per del, höjden i förhållande till den största.
// Staplar med tone "accent" lyser i accentfärgen (t.ex. amorteringen, som är sparande).
// ---------------------------------------------------------------------------
export interface Bar { label: string; amount: number; tone?: 'accent' }

export function MiniBars({ bars }: { bars: Bar[] }) {
  const still = useReducedMotion()
  const max = Math.max(...bars.map((b) => b.amount), 1)
  return (
    <div className="minibars" role="img" aria-label={bars.map((b) => `${b.label} ${kr(b.amount)}`).join(', ')}>
      {bars.map((b, i) => (
        <div key={b.label} className="minibars__col" title={`${b.label}: ${kr(b.amount)}`}>
          <div className="minibars__track">
            <motion.span
              className={`minibars__bar ${b.tone === 'accent' ? 'is-accent' : ''}`}
              initial={still ? false : { height: 0 }}
              animate={{ height: `${Math.max(4, (b.amount / max) * 100)}%` }}
              transition={{ ...grow, delay: grow.delay + i * 0.06 }}
            />
          </div>
          <span className="minibars__label">{b.label}</span>
        </div>
      ))}
    </div>
  )
}
