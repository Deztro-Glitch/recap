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

// ---------------------------------------------------------------------------
// Prismätare: en smal linje från grönt (billigt) via gult till rött (dyrt), med en prick där priset är nu.
// share 0 = dagens lägsta, 1 = dagens högsta.
// ---------------------------------------------------------------------------
export function PriceMeter({ share, label }: { share: number; label: string }) {
  const still = useReducedMotion()
  const at = `${Math.max(0, Math.min(1, share)) * 100}%`
  return (
    <div className="pricemeter" role="img" aria-label={label}>
      <motion.span
        className="pricemeter__dot"
        initial={still ? false : { left: '0%', opacity: 0 }}
        animate={{ left: at, opacity: 1 }}
        transition={grow}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Ytdiagram för ett dygn: kurvan genom periodernas mitt, en mjuk yta under, och en lodrät linje med en
// glödande punkt där vi är just nu. Klockslagen står under, i HTML så att texten blir skarp.
// ---------------------------------------------------------------------------
const AW = 320, AH = 140, A_TOP = 14, A_BOTTOM = 4

export function AreaChart({ values, at, ticks, label }: { values: number[]; at: number | null; ticks: { i: number; label: string }[]; label: string }) {
  const still = useReducedMotion()
  const gid = useId()
  const n = values.length
  const lo = Math.min(0, ...values)
  const hi = Math.max(...values) * 1.12 || lo + 1
  const x = (i: number) => (i / n) * AW
  const y = (v: number) => A_TOP + (1 - (v - lo) / (hi - lo)) * (AH - A_TOP - A_BOTTOM)
  const pts = values.map((v, i) => [x(i + 0.5), y(v)] as const)
  const line = `M0,${pts[0][1]} ` + pts.map(([px, py]) => `L${px.toFixed(1)},${py.toFixed(1)}`).join(' ') + ` L${AW},${pts[n - 1][1]}`
  const area = `${line} L${AW},${AH} L0,${AH} Z`
  const nowX = at != null ? x(at) : null
  const nowY = at != null ? y(values[Math.min(n - 1, Math.floor(at))]) : null

  return (
    <div className="areachart" role="img" aria-label={label}>
      <svg viewBox={`0 0 ${AW} ${AH}`} className="areachart__svg">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" className="areachart__stop-top" />
            <stop offset="100%" className="areachart__stop-bottom" />
          </linearGradient>
        </defs>
        {lo < 0 && <line x1="0" x2={AW} y1={y(0)} y2={y(0)} className="areachart__zero" />}
        <motion.path d={area} fill={`url(#${gid})`} initial={still ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.4 }} />
        <motion.path d={line} className="areachart__line" initial={still ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ ...grow, duration: 1.4 }} />
        {nowX != null && nowY != null && (
          <motion.g initial={still ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2, duration: 0.4 }}>
            <line x1={nowX} x2={nowX} y1={A_TOP - 6} y2={AH} className="areachart__now" />
            <circle cx={nowX} cy={nowY} r="9" className="areachart__halo" />
            <circle cx={nowX} cy={nowY} r="4.5" className="areachart__dot" />
          </motion.g>
        )}
      </svg>
      <div className="areachart__ticks" aria-hidden>
        {ticks.map((t) => <span key={t.i} style={{ left: `${(t.i / n) * 100}%` }}>{t.label}</span>)}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Aktivitetsring (som på en klocka): en tjock rund båge i en färg, spåret i samma färg men svagt,
// och en ikon i mitten. Fylls från toppen och glöder lite.
// ---------------------------------------------------------------------------
export function ActivityRing({ share, color, size = 76, label, children }: { share: number; color: string; size?: number; label: string; children?: ReactNode }) {
  const still = useReducedMotion()
  const pct = Math.max(0, Math.min(1, share)) * 100
  const style = { width: size, height: size, '--ring': color } as React.CSSProperties
  return (
    <div className="aring" style={style} role="img" aria-label={label}>
      <svg viewBox="0 0 44 44" className="aring__svg">
        <circle cx="22" cy="22" r="17" pathLength={100} className="aring__track" />
        <motion.circle
          cx="22" cy="22" r="17" pathLength={100} className="aring__fill"
          initial={still ? false : { strokeDasharray: '0 100' }}
          animate={{ strokeDasharray: `${pct > 0 ? Math.max(pct, 2) : 0} 100` }}
          transition={{ duration: 1.2, ease: [0.2, 0.8, 0.2, 1], delay: 0.2 }}
        />
      </svg>
      <div className="aring__center">{children}</div>
    </div>
  )
}
