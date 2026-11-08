import type { ReactNode } from 'react'
import { IconArrowUpRight } from '@tabler/icons-react'
import { GlassCard } from './GlassCard'

type IconType = React.ComponentType<{ size?: number; stroke?: number }>

// Ett ljust statistikkort: ikon och rubrik, en stor siffra, ibland en märkning och en stapel.
// Hela kortet går att öppna (detaljvyn); pilen uppe till höger visar det. Ingen förklarande text på kortet.
// tone "accent": det stora kortet i accentfärgen med vit text (Bolån i Boende).
export function StatCard({ icon: Icon, label, value, badge, top, onOpen, className, tone = 'light', children }: {
  icon: IconType
  label: string
  value?: ReactNode   // utelämnas när kortet visar en graf i stället för en enda siffra
  badge?: ReactNode
  top?: ReactNode     // något mellan rubriken och siffran, t.ex. flikar
  onOpen: () => void
  className?: string
  tone?: 'light' | 'accent'
  children?: ReactNode
}) {
  return (
    <GlassCard className={['kpi', tone === 'accent' ? 'glass--accent' : 'glass--light', className].filter(Boolean).join(' ')} onClick={onOpen} lift>
      <div className="kpi__head">
        <span className="kpi__icon"><Icon size={16} stroke={1.8} /></span>
        <span className="kpi__label">{label}</span>
        {badge && <span className="kpi__badge">{badge}</span>}
        <span className="kpi__open" aria-hidden><IconArrowUpRight size={15} stroke={2} /></span>
      </div>
      {top}
      {value !== undefined && <div className="kpi__value">{value}</div>}
      {children}
    </GlassCard>
  )
}
