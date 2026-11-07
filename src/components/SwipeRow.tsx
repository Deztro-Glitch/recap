import { animate, motion, useMotionValue, useTransform } from 'framer-motion'
import { useRef, type ReactNode } from 'react'
import { ease, rowAnim } from './ui'
import { GlassCard } from './GlassCard'

const OPEN = -96

// En rad som man sveper åt vänster för att visa "Ta bort", som i iPhones egna appar.
// Sveper man hela vägen tas raden bort direkt.
export function SwipeRow({ children, onDelete, onClick, className = '' }: { children: ReactNode; onDelete: () => void; onClick: () => void; className?: string }) {
  const x = useMotionValue(0)
  const dragged = useRef(false)
  const width = useRef(0)
  // Glaset är genomskinligt, så den röda knappen fyller bara ytan som raden har lämnat.
  const reveal = useTransform(x, (v) => `${Math.max(0, -v - 2)}px`)

  const settle = (to: number) => animate(x, to, { duration: 0.3, ease })

  return (
    <GlassCard flush lift layout="position" {...rowAnim} className="swipe" ref={(el: HTMLDivElement | null) => { if (el) width.current = el.offsetWidth }}>
      <motion.button className="swipe__delete" style={{ width: reveal }} onClick={onDelete} tabIndex={-1}>Ta bort</motion.button>
      <motion.div
        className={`row swipe__front ${className}`}
        style={{ x }}
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -width.current || -400, right: 0 }}
        dragElastic={{ left: 0.05, right: 0 }}
        dragMomentum={false}
        onDragStart={() => { dragged.current = true }}
        onDragEnd={() => {
          const pos = x.get()
          if (pos < -width.current * 0.6) {
            settle(-width.current).then(onDelete)
          } else settle(pos < OPEN / 2 ? OPEN : 0)
        }}
        onClick={() => {
          if (dragged.current) {
            dragged.current = false
            return
          }
          if (x.get() < 0) settle(0)
          else onClick()
        }}
      >
        {children}
      </motion.div>
    </GlassCard>
  )
}
