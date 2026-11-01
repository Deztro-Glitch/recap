import { animate, motion, useMotionValue } from 'framer-motion'
import { useRef, type ReactNode } from 'react'
import { ease, rowAnim } from './ui'

const OPEN = -96

// En rad som man sveper åt vänster för att visa "Ta bort", som i iPhones egna appar.
// Sveper man hela vägen tas raden bort direkt.
export function SwipeRow({ children, onDelete, onClick, className = '' }: { children: ReactNode; onDelete: () => void; onClick: () => void; className?: string }) {
  const x = useMotionValue(0)
  const dragged = useRef(false)
  const width = useRef(0)

  const settle = (to: number) => animate(x, to, { duration: 0.3, ease })

  return (
    <motion.div layout="position" {...rowAnim} className="swipe" ref={(el) => { if (el) width.current = el.offsetWidth }}>
      <button className="swipe__delete" onClick={onDelete} tabIndex={-1}>Ta bort</button>
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
    </motion.div>
  )
}
