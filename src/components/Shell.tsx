import type { ReactNode } from 'react'
import { IconChevronDown, IconPlus } from '@tabler/icons-react'
import type { User } from '../lib/api'
import { Primary } from './ui'

export const initials = (email: string) => email.split('@')[0].replace(/[^a-zåäö]/gi, '').slice(0, 2).toUpperCase() || '?'

export function Wordmark() {
  return <div className="wordmark">recap<span>.</span></div>
}

type IconType = React.ComponentType<{ size?: number }>
export interface Tab { id: string; label: string; icon: IconType; active: boolean; onClick: () => void }

interface Props {
  user: User
  nav: ReactNode
  navFoot?: ReactNode
  home?: { name: string; onClick: () => void }  // hemmets namn uppe till vänster
  onAdd?: () => void                             // "Lägg till" (uppe på dator, plus i bottenmenyn på mobil)
  tabs?: Tab[]                                   // bottenmenyn på mobil, plusknappen hamnar i mitten
  onTabAdd?: () => void                          // plusknappen i bottenmenyn, om den ska göra något annat än "Lägg till"
  onAvatar?: () => void
  children: ReactNode
}

export function Shell({ user, nav, navFoot, home, onAdd, onTabAdd, tabs, onAvatar, children }: Props) {
  const half = tabs ? Math.ceil(tabs.length / 2) : 0
  const tab = (t: Tab) => (
    <button key={t.id} className={`tabbar__item ${t.active ? 'is-active' : ''}`} onClick={t.onClick}>
      <t.icon size={22} />
      {t.label}
    </button>
  )

  return (
    <div className={`app ${tabs ? 'app--tabs' : ''}`}>
      <nav className="sidebar">
        <Wordmark />
        {nav}
        {navFoot && <div className="sidebar__foot">{navFoot}</div>}
      </nav>

      <main className="main">
        <div className="topbar">
          {home ? (
            <button className="topbar__home" onClick={home.onClick}>
              <span>{home.name}</span>
              <IconChevronDown size={16} />
            </button>
          ) : (
            <div style={{ marginRight: 'auto' }} />
          )}
          {onAdd && <span className="topbar__add"><Primary onClick={onAdd}>Lägg till</Primary></span>}
          <button className="avatar" style={{ border: 0, cursor: onAvatar ? 'pointer' : 'default' }} onClick={onAvatar} aria-label="Konto">
            {initials(user.email)}
          </button>
        </div>
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

export function NavItem({ icon: Icon, label, active, onClick }: { icon: IconType; label: string; active?: boolean; onClick: () => void }) {
  return (
    <a className={`nav-item ${active ? 'is-active' : ''}`} onClick={onClick} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onClick()}>
      <Icon size={18} />
      {label}
    </a>
  )
}
