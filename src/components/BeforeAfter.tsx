import { useRef, useState } from 'react'
import { IconArrowsHorizontal } from '@tabler/icons-react'

// Dra reglaget åt sidan för att jämföra före- och efterbild.
export function BeforeAfter({ before, after }: { before: string; after: string }) {
  const [pos, setPos] = useState(50)
  const ref = useRef<HTMLDivElement>(null)

  const move = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect()
    setPos(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)))
  }

  return (
    <div
      ref={ref}
      className="ba"
      onPointerDown={(e) => {
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
        move(e.clientX)
      }}
      onPointerMove={(e) => e.buttons && move(e.clientX)}
    >
      <img src={after} alt="Efter" />
      <img src={before} alt="Före" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} />
      <span className="ba__label" style={{ left: 12 }}>Före</span>
      <span className="ba__label" style={{ right: 12 }}>Efter</span>
      <div className="ba__line" style={{ left: `${pos}%` }}>
        <div className="ba__knob"><IconArrowsHorizontal size={18} /></div>
      </div>
    </div>
  )
}
