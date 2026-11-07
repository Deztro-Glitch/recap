import type { ReactNode } from 'react'
import { GlassCard } from './GlassCard'

type IconType = React.ComponentType<{ size?: number; stroke?: number }>

// Ett ljust statistikkort: ikon och rubrik, en stor siffra, ibland en märkning och en stapel.
// Ingen förklarande text; detaljerna finns i formuläret man når genom att trycka på kortet.
export function StatCard({ icon: Icon, label, value, badge, onClick, lift, className, children }: {
  icon: IconType
  label: string
  value: ReactNode
  badge?: ReactNode
  onClick?: () => void
  lift?: boolean
  className?: string
  children?: ReactNode
}) {
  return (
    <GlassCard className={['kpi', 'glass--light', className].filter(Boolean).join(' ')} onClick={onClick} lift={lift}>
      <div className="kpi__head">
        <span className="kpi__icon"><Icon size={16} stroke={1.8} /></span>
        <span className="kpi__label">{label}</span>
        {badge && <span className="kpi__badge">{badge}</span>}
      </div>
      <div className="kpi__value">{value}</div>
      {children}
    </GlassCard>
  )
}
