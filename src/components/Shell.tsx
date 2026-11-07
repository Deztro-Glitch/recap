import { useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { IconChevronDown, IconPlus } from '@tabler/icons-react'
import type { User } from '../lib/api'
import { Primary } from './ui'
import { GlassCard } from './GlassCard'

export const initials = (email: string) => email.split('@')[0].replace(/[^a-zåäö]/gi, '').slice(0, 2).toUpperCase() || '?'

export function Wordmark() {
  return <div className="wordmark">recap<span>.</span></div>
}

type IconType = React.ComponentType<{ size?: number }>
export interface Tab { id: string; label: string; icon: IconType; active: boolean; onClick: () => void }

interface Props {
  user: User
  nav: Tab[]                                     // menypillret uppe i mitten
  home?: { name: string; onClick: () => void }  // hemmets namn uppe till vänster
  onAdd?: () => void                             // "Lägg till" (uppe på dator, plus i bottenmenyn på mobil)
  tabs?: Tab[]                                   // bottenmenyn på mobil, plusknappen hamnar i mitten
  onTabAdd?: () => void                          // plusknappen i bottenmenyn, om den ska göra något annat än "Lägg till"
  onAvatar?: () => void
  children: ReactNode
}

export function Shell({ user, nav, home, onAdd, onTabAdd, tabs, onAvatar, children }: Props) {
  const half = tabs ? Math.ceil(tabs.length / 2) : 0
  const tab = (t: Tab) => (
    <button key={t.id} className={`tabbar__item ${t.active ? 'is-active' : ''}`} onClick={t.onClick}>
      <t.icon size={22} />
      {t.label}
    </button>
  )

  return (
    <div className={`app ${tabs ? 'app--tabs' : ''}`}>
      <main className="main">
        {/* Svävar högst upp över innehållet: hemmet till vänster, menypillret i mitten, Lägg till till höger. */}
        <header className="topbar">
          <GlassCard className="topbar__brand" lift={false}>
            <Wordmark />
            {home && (
              <button className="topbar__home" onClick={home.onClick}>
                <span>{home.name}</span>
                <IconChevronDown size={16} />
              </button>
            )}
          </GlassCard>
          <NavPill items={nav} />
          <div className="topbar__end">
            {onAdd && <span className="topbar__add"><Primary onClick={onAdd}>Lägg till</Primary></span>}
            <button className="avatar" style={{ border: 0, cursor: onAvatar ? 'pointer' : 'default' }} onClick={onAvatar} aria-label="Konto">
              {initials(user.email)}
            </button>
          </div>
        </header>
        {children}
      </main>

      {tabs && (
        <nav className="tabbar glass">
          {tabs.slice(0, half).map(tab)}
          {onAdd && (
            <button className="tabbar__add" onClick={onTabAdd ?? onAdd} aria-label="Lägg till">
              <IconPlus size={24} />
            </button>
          )}
          {tabs.slice(half).map(tab)}
        </nav>
      )}
    </div>
  )
}

// Menypillret: markeringen för det valda glider till nästa val, och en glasyta följer muspekaren.
const glide = { type: 'spring', stiffness: 520, damping: 42, mass: 0.8 } as const

function NavPill({ items }: { items: Tab[] }) {
  const [hover, setHover] = useState<string | null>(null)
  return (
    <GlassCard className="pill" lift={false} role="navigation" aria-label="Meny" onMouseLeave={() => setHover(null)}>
      {items.map((t) => (
        <button
          key={t.id}
          className={`pill__item ${t.active ? 'is-active' : ''}`}
          onClick={t.onClick}
          onMouseEnter={() => setHover(t.id)}
          onFocus={() => setHover(t.id)}
          onBlur={() => setHover(null)}
          aria-current={t.active ? 'page' : undefined}
          title={t.label}
        >
          {t.active && <motion.span layoutId="pill-active" className="pill__active" transition={glide} />}
          {hover === t.id && <motion.span layoutId="pill-hover" className="pill__hover" transition={glide} />}
          <t.icon size={17} />
          <span className="pill__label">{t.label}</span>
        </button>
      ))}
    </GlassCard>
  )
}
