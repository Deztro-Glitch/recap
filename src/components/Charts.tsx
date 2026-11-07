import { useId, type ReactNode } from 'react'
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

// ghost: platshållare (gråa randiga staplar utan belopp) tills det finns riktig data.
export function MiniBars({ bars, ghost }: { bars: Bar[]; ghost?: boolean }) {
  const still = useReducedMotion()
  const max = Math.max(...bars.map((b) => b.amount), 1)
  return (
    <div className={`minibars ${ghost ? 'is-ghost' : ''}`} role="img" aria-label={ghost ? 'Ingen data än' : bars.map((b) => `${b.label} ${kr(b.amount)}`).join(', ')}>
      {bars.map((b, i) => {
        // Tomma staplar (t.ex. en månad utan köp) visar bara spåret, utan belopp.
        const h = b.amount > 0 ? Math.max(6, (b.amount / max) * 100) : 0
        return (
          <div key={b.label} className="minibars__col">
            <div className="minibars__track">
              <motion.div
                className={`minibars__bar ${b.tone === 'accent' ? 'is-accent' : ''}`}
                initial={still ? false : { height: 0 }}
                animate={{ height: `${h}%` }}
                transition={{ ...grow, delay: grow.delay + i * 0.07 }}
              >
                {!ghost && b.amount > 0 && <span className="minibars__value">{kr(b.amount)}</span>}
              </motion.div>
            </div>
            <span className="minibars__label" title={b.label}>{b.label}</span>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Liten ring som visar hur stor del som är betald (t.ex. MC-lånet). Fylls i accent och animeras in.
// ---------------------------------------------------------------------------
export function Ring({ share, size = 64, label }: { share: number; size?: number; label: string }) {
  const still = useReducedMotion()
  const pct = Math.max(0, Math.min(1, share)) * 100
  return (
    <svg className="ring" viewBox="0 0 44 44" width={size} height={size} role="img" aria-label={label}>
      <circle cx="22" cy="22" r="18" pathLength={100} className="ring__track" />
      <motion.circle
        cx="22" cy="22" r="18" pathLength={100} className="ring__fill"
        initial={still ? false : { strokeDasharray: '0 100' }}
        animate={{ strokeDasharray: `${pct > 0 ? Math.max(pct, 1.5) : 0} 100` }}
        transition={grow}
      />
      <text x="22" y="22" className="ring__text" dominantBaseline="central" textAnchor="middle">{Math.round(pct)}%</text>
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Flikar ("segmented control"): markeringen glider till det valda. Klick stannar i flikarna,
// så att de inte öppnar kortet de ligger i.
// ---------------------------------------------------------------------------
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  const id = useId()
  return (
    <div className="segmented" role="tablist" aria-label={label} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} className={`segmented__item ${o.value === value ? 'is-active' : ''}`} onClick={() => onChange(o.value)}>
          {o.value === value && <motion.span layoutId={`seg-${id}`} className="segmented__thumb" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
          <span className="segmented__label">{o.label}</span>
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Munkdiagram: hela ringen är 100 % (t.ex. lönen). Varje del ritas som en båge i sin färg, med en
// liten glipa emellan, och det som blir över ligger kvar som spår. Texten står i hålet.
// ---------------------------------------------------------------------------
export interface Slice { key: string; label: string; amount: number; color: string }

export function Donut({ slices, total, label, children }: { slices: Slice[]; total: number; label: string; children?: ReactNode }) {
  const still = useReducedMotion()
  const sum = slices.reduce((s, x) => s + x.amount, 0)
  const base = Math.max(total, sum, 1)   // går utgifterna över lönen fylls hela ringen
  const GAP = slices.length > 1 ? 0.8 : 0
  let at = 0
  return (
    <div className="donut" role="img" aria-label={label}>
      <svg viewBox="0 0 200 200" className="donut__svg">
        <circle cx="100" cy="100" r="80" pathLength={100} className="donut__track" />
        {slices.map((s, i) => {
          const len = (s.amount / base) * 100
          const start = at
          at += len
          const shown = Math.max(0.4, len - GAP)
          return (
            <motion.circle
              key={s.key}
              cx="100" cy="100" r="80" pathLength={100}
              className="donut__slice"
              style={{ stroke: s.color }}
              strokeDashoffset={-start}
              initial={still ? false : { strokeDasharray: '0 100' }}
              animate={{ strokeDasharray: `${shown} ${100 - shown}` }}
              transition={{ ...grow, delay: grow.delay + i * 0.08 }}
            />
          )
        })}
      </svg>
      <div className="donut__center">{children}</div>
    </div>
  )
}
