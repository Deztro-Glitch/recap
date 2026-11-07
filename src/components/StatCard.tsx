import type { ReactNode } from 'react'
import { IconArrowUpRight } from '@tabler/icons-react'
import { GlassCard } from './GlassCard'

type IconType = React.ComponentType<{ size?: number; stroke?: number }>

// Ett ljust statistikkort: ikon och rubrik, en stor siffra, ibland en märkning och en stapel.
// Hela kortet går att öppna (detaljvyn); pilen uppe till höger visar det. Ingen förklarande text på kortet.
export function StatCard({ icon: Icon, label, value, badge, onOpen, className, children }: {
  icon: IconType
  label: string
  value: ReactNode
  badge?: ReactNode
  onOpen: () => void
  className?: string
  children?: ReactNode
}) {
  return (
    <GlassCard className={['kpi', 'glass--light', className].filter(Boolean).join(' ')} onClick={onOpen} lift>
      <div className="kpi__head">
        <span className="kpi__icon"><Icon size={16} stroke={1.8} /></span>
        <span className="kpi__label">{label}</span>
        {badge && <span className="kpi__badge">{badge}</span>}
        <span className="kpi__open" aria-hidden><IconArrowUpRight size={15} stroke={2} /></span>
      </div>
      <div className="kpi__value">{value}</div>
      {children}
    </GlassCard>
  )
}
