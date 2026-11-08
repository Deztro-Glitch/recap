import { useRef } from 'react'
import { Sheet } from '../../components/ui'

type Stat = { title: string }

// Detaljvyn för ett statistikkort. Glider in från höger på dator och underifrån på mobilen.
// Än så länge bara rubriken; innehållet byggs ut kort för kort.
export function StatDetail({ stat, onClose }: { stat: Stat | null; onClose: () => void }) {
  // Behåll rubriken medan panelen glider ut, så att den inte blir tom på vägen.
  const last = useRef<Stat>({ title: '' })
  if (stat) last.current = stat
  const shown = last.current

  return (
    <Sheet open={!!stat} onClose={onClose} title={shown.title}>
      {null}
    </Sheet>
  )
}
