import { animate, useReducedMotion } from 'framer-motion'
import { useEffect, useRef } from 'react'
import { kr } from '../lib/format'

// Ett belopp som rullar upp till sitt värde: från noll när kortet visas, från det gamla värdet när det ändras.
// Texten skrivs direkt i elementet varje bildruta, så att React inte renderar om under rullningen.
export function Counter({ value, format = kr, duration = 0.9 }: { value: number; format?: (n: number) => string; duration?: number }) {
  const el = useRef<HTMLSpanElement>(null)
  const shown = useRef(0)
  const still = useReducedMotion()

  useEffect(() => {
    const write = (v: number) => {
      shown.current = v
      if (el.current) el.current.textContent = format(v)
    }
    if (still) return write(value)
    const run = animate(shown.current, value, { duration, ease: [0.2, 0.8, 0.2, 1], onUpdate: write })
    return () => run.stop()
  }, [value, still])

  return <span ref={el}>{format(shown.current)}</span>
}
