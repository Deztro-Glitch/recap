import { AnimatePresence, motion } from 'framer-motion'
import { GlassCard } from './GlassCard'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconCheck, IconChevronDown, IconX } from '@tabler/icons-react'

// Samma kurva som --ease i design.css.
export const ease = [0.65, 0, 0.35, 1] as const
export const isMobile = () => matchMedia('(max-width: 760px)').matches

// wide: bredare panel på dator, för vyer med grafer (t.ex. kassaflödet).
export function Sheet({ open, onClose, title, wide, children }: { open: boolean; onClose: () => void; title: string; wide?: boolean; children: ReactNode }) {
  const from = isMobile() ? { y: '100%' } : { x: '105%' }
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [open, onClose])
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="backdrop" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease }} />
          <GlassCard className={`sheet ${wide ? 'sheet--wide' : ''}`} lift={false} role="dialog" aria-modal="true" aria-label={title} initial={from} animate={{ x: 0, y: 0 }} exit={from} transition={{ duration: 0.4, ease }}>
            <div className="sheet__head">
              <h2>{title}</h2>
              <button className="btn btn--ghost" aria-label="Stäng" onClick={onClose}><IconX size={18} /></button>
            </div>
            {children}
          </GlassCard>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}

export function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className={`field ${error ? 'has-error' : ''}`}>
      <span className="field__label">{label}</span>
      {children}
      {error && <span className="field__error">{error}</span>}
    </label>
  )
}

// Fält som sällan behövs, gömda bakom "Fler detaljer" så att formuläret blir kort.
export function More({ open: initial, children }: { open?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(!!initial)
  useEffect(() => setOpen(!!initial), [initial])
  return open ? (
    <>{children}</>
  ) : (
    <div>
      <button type="button" className="btn btn--ghost" style={{ marginLeft: -16 }} onClick={() => setOpen(true)}>
        <IconChevronDown size={16} /> Fler detaljer
      </button>
    </div>
  )
}

// En sektion som går att fälla ihop, t.ex. det som redan är klart.
export function Collapsible({ title, meta, startOpen = true, children }: { title: string; meta?: string; startOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(startOpen)
  return (
    <div className="collapsible">
      <button type="button" className="collapsible__head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <h2>{title}</h2>
        {meta && <span className="meta">{meta}</span>}
        <IconChevronDown size={18} className="collapsible__chevron" />
      </button>
      {open && children}
    </div>
  )
}

export function Primary({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className="btn btn--primary" {...props}>
      <span>{children}</span>
      <span className="ripple" />
    </button>
  )
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="checkbox" onClick={(e) => e.stopPropagation()}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span className="checkbox__box">
        <svg viewBox="0 0 30 30"><path d="M8 15.5 L13 20.5 L22.5 10" /></svg>
      </span>
    </label>
  )
}

export function Chips<T extends string | number | boolean | null>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="chips">
      {options.map((o) => (
        <button type="button" key={String(o.value)} className={`chip ${o.value === value ? 'is-active' : ''}`} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Loader() {
  const pts = '0.157 23.954, 14 23.954, 21.843 48, 43 0, 50 24, 64 24'
  return (
    <div className="loading">
      <svg className="loader" width="64" height="48" aria-label="Laddar">
        <polyline className="loader__back" points={pts} />
        <polyline className="loader__front" points={pts} />
      </svg>
    </div>
  )
}

// ---------- Notis ----------

type Toast = { title: string; body?: string; action?: { label: string; on: () => void } }
const ToastCtx = createContext<(t: Toast | string) => void>(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(Toast & { key: number }) | null>(null)
  const show = useCallback((t: Toast | string) => {
    const key = Date.now()
    setToast({ ...(typeof t === 'string' ? { title: t } : t), key })
    // En notis med knapp står kvar längre, så att man hinner trycka.
    setTimeout(() => setToast((c) => (c?.key === key ? null : c)), typeof t !== 'string' && t.action ? 6000 : 3200)
  }, [])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="toast-host">
        <AnimatePresence>
          {toast && (
            <motion.div key={toast.key} className="toast" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} transition={{ duration: 0.3, ease }}>
              <div className="toast__icon"><IconCheck size={16} /></div>
              <div>
                <div className="toast__title">{toast.title}</div>
                {toast.body && <p className="toast__body" style={{ marginBottom: 0 }}>{toast.body}</p>}
                {toast.action && (
                  <div className="toast__actions" style={{ marginTop: 'var(--s-2)' }}>
                    <button className="btn btn--secondary" onClick={() => { toast.action!.on(); setToast(null) }}>{toast.action.label}</button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  )
}

export const rowAnim = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, transition: { duration: 0.2 } },
  transition: { duration: 0.3, ease },
}
