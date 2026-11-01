import { useState, type ReactNode } from 'react'
import { IconMoon, IconSearch, IconSun } from '@tabler/icons-react'
import type { User } from '../lib/api'

function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark')
  const toggle = () => {
    const next = !dark
    setDark(next)
    document.documentElement.dataset.theme = next ? 'dark' : ''
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', next ? '#0E0C15' : '#E7E4F0')
    try {
      localStorage.setItem('recap-theme', next ? 'dark' : 'light')
    } catch {}
  }
  return { dark, toggle }
}

export const initials = (email: string) => email.split('@')[0].replace(/[^a-zåäö]/gi, '').slice(0, 2).toUpperCase() || '?'

export function Wordmark() {
  return <div className="wordmark">recap<span>.</span></div>
}

interface Props {
  user: User
  nav: ReactNode
  navFoot?: ReactNode
  search?: { value: string; onChange: (v: string) => void; placeholder: string }
  processbar?: ReactNode
  onAvatar?: () => void
  children: ReactNode
}

export function Shell({ user, nav, navFoot, search, processbar, onAvatar, children }: Props) {
  const theme = useTheme()
  return (
    <div className={`app ${processbar ? '' : 'app--no-process'}`}>
      <nav className="sidebar">
        <Wordmark />
        {nav}
        {navFoot && <div className="sidebar__foot">{navFoot}</div>}
      </nav>

      <main className="main">
        <div className="topbar">
          {search ? (
            <label className="search">
              <IconSearch size={16} />
              <input value={search.value} onChange={(e) => search.onChange(e.target.value)} placeholder={search.placeholder} />
            </label>
          ) : (
            <div style={{ marginRight: 'auto' }} />
          )}
          <button className="btn btn--ghost" onClick={theme.toggle} aria-label="Byt ljust och mörkt läge">
            {theme.dark ? <IconSun size={18} /> : <IconMoon size={18} />}
          </button>
          <button className="avatar" style={{ border: 0, cursor: onAvatar ? 'pointer' : 'default' }} onClick={onAvatar} aria-label="Konto">
            {initials(user.email)}
          </button>
        </div>
        {children}
      </main>

      {processbar}
    </div>
  )
}

export function NavItem({ icon: Icon, label, active, onClick }: { icon: React.ComponentType<{ size?: number }>; label: string; active?: boolean; onClick: () => void }) {
  return (
    <a className={`nav-item ${active ? 'is-active' : ''}`} onClick={onClick} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onClick()}>
      <Icon size={18} />
      {label}
    </a>
  )
}
